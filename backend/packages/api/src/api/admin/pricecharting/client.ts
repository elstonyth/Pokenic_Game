// Tiny server-side PriceCharting client shared by the /admin/pricecharting/*
// proxy routes. The API is a paid product authenticated by a 40-char token
// (https://www.pricecharting.com/api-documentation): the token is read from
// PRICECHARTING_API_TOKEN and appended as the `t` query param — it must NEVER be
// exposed to the browser, which is why the admin UI talks to these proxies.
// Upstream prices are integer PENNIES; conversion to USD happens in the routes.

const BASE_URL = "https://www.pricecharting.com";
const TIMEOUT_MS = 10_000;

export const PC_TOKEN_MISSING =
  "PriceCharting is not configured: set PRICECHARTING_API_TOKEN in the backend .env " +
  "(requires a paid PriceCharting subscription) or enter the market value manually.";

export type PcResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "no-token" }
  | { kind: "error"; message: string };

export async function pcFetch<T extends { status: string; "error-message"?: string }>(
  path: string,
  params: Record<string, string>
): Promise<PcResult<T>> {
  const token = process.env.PRICECHARTING_API_TOKEN;
  if (!token) return { kind: "no-token" };

  const url = new URL(path, BASE_URL);
  url.searchParams.set("t", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let resp: Response;
  try {
    resp = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    return { kind: "error", message: "PriceCharting did not respond — try again." };
  }

  let data: T;
  try {
    data = (await resp.json()) as T;
  } catch {
    return { kind: "error", message: "PriceCharting returned an unreadable response." };
  }

  if (!resp.ok || data.status !== "success") {
    return {
      kind: "error",
      message: data["error-message"] ?? `PriceCharting error (HTTP ${resp.status}).`,
    };
  }
  return { kind: "ok", data };
}
