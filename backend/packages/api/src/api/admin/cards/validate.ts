import { MedusaError } from "@medusajs/framework/utils";
import type { RegisterCardInput } from "../../../workflows/steps/create-card";
import type { UpdateCardInput } from "../../../workflows/steps/update-card";

const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TEXT = 512;
const MAX_URL = 2048;
const IMAGE_RE = /^(https?:\/\/|\/)/;

const bad = (message: string): never => {
  throw new MedusaError(MedusaError.Types.INVALID_DATA, message);
};

const reqStr = (b: Record<string, unknown>, key: string): string => {
  const v = b[key];
  if (typeof v !== "string" || v.trim() === "") bad(`'${key}' is required.`);
  const s = (b[key] as string).trim();
  if (s.length > MAX_TEXT) bad(`'${key}' is too long (max ${MAX_TEXT} chars).`);
  return s;
};

// Image: required, length-capped, restricted to http(s) URLs or storefront-
// relative paths (blocks oversized data: URIs and odd schemes).
const imageStr = (b: Record<string, unknown>, key: string): string => {
  const v = b[key];
  if (typeof v !== "string" || v.trim() === "") bad(`'${key}' is required.`);
  const s = (b[key] as string).trim();
  if (s.length > MAX_URL) bad(`'${key}' is too long (max ${MAX_URL} chars).`);
  if (!IMAGE_RE.test(s)) {
    bad(`'${key}' must be an http(s) URL or a /storefront path.`);
  }
  return s;
};

const optStr = (b: Record<string, unknown>, key: string): string => {
  const v = b[key];
  return typeof v === "string" ? v.trim() : "";
};

const reqNum = (b: Record<string, unknown>, key: string): number => {
  const v = typeof b[key] === "string" ? Number(b[key]) : b[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    bad(`'${key}' must be a number >= 0.`);
  }
  return v as number;
};

const asObject = (raw: unknown): Record<string, unknown> => {
  if (!raw || typeof raw !== "object") {
    bad("Body must be an object.");
  }
  return raw as Record<string, unknown>;
};

// Coerce + validate the registration body (inventory-first create): the product
// is referenced by id; only the gacha facts are entered. Rarity is per-pack and
// is NOT part of a card.
export function coerceRegisterCardBody(raw: unknown): RegisterCardInput {
  const b = asObject(raw);

  return {
    product_id: reqStr(b, "product_id"),
    set: optStr(b, "set"),
    grader: optStr(b, "grader"),
    grade: optStr(b, "grade"),
    market_value: reqNum(b, "market_value"),
  };
}

// Coerce + validate the card edit body. `handle` comes from the route params
// (immutable — it keys PackOdds/Pull/Product).
export function coerceUpdateCardBody(
  raw: unknown,
  handle: string
): UpdateCardInput {
  const b = asObject(raw);

  if (!HANDLE_RE.test(handle)) {
    bad("'handle' must be lowercase kebab-case (letters, digits, hyphens).");
  }

  const priceRaw = b.price;
  const price =
    priceRaw === undefined || priceRaw === null || priceRaw === ""
      ? undefined
      : reqNum(b, "price");

  return {
    handle,
    name: reqStr(b, "name"),
    set: optStr(b, "set"),
    grader: optStr(b, "grader"),
    grade: optStr(b, "grade"),
    market_value: reqNum(b, "market_value"),
    image: imageStr(b, "image"),
    price,
    for_sale: b.for_sale !== false, // default true unless explicitly false
  };
}
