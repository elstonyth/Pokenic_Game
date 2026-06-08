"use server";

/**
 * Customer auth server actions (emailpass). Called from the client auth modal.
 * Running server-side keeps the JWT in an httpOnly cookie and avoids browser
 * CORS (the backend doesn't allow the :4000 origin). The token exchange uses
 * `sdk.client.fetch` (returns `{ token }`) so the shared SDK singleton never
 * holds per-request auth state; customer create/retrieve pass an explicit Bearer.
 *
 * Medusa v2 emailpass flow (verified against the backend):
 *  signup: register → {token} → create customer (Bearer register-token) → login
 *  login:  /auth/customer/emailpass → {token} → store → retrieve /me
 */
import type { HttpTypes } from "@medusajs/types";
import { sdk } from "@/lib/medusa";
import { logger } from "@/lib/logger";
import { setAuthToken, clearAuthToken } from "@/lib/data/customer";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export type AuthCustomer = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
};

export type AuthResult =
  | { ok: true; customer: AuthCustomer }
  | { ok: false; error: string };

type TokenResponse = { token: string };

const toAuthCustomer = (c: HttpTypes.StoreCustomer): AuthCustomer => ({
  id: c.id,
  email: c.email,
  first_name: c.first_name,
  last_name: c.last_name,
});

// Map known backend errors to friendly copy; never surface raw errors to the UI.
function friendlyError(error: unknown, fallback: string): string {
  const text = error instanceof Error ? error.message : String(error);
  if (/already exists/i.test(text))
    return "An account with this email already exists.";
  if (/invalid email or password/i.test(text))
    return "Incorrect email or password.";
  return fallback;
}

async function exchangeToken(path: string, email: string, password: string): Promise<string> {
  const { token } = await sdk.client.fetch<TokenResponse>(path, {
    method: "POST",
    body: { email, password },
  });
  return token;
}

export async function login(input: {
  email: string;
  password: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  // Validate at the boundary — a server action is a public endpoint.
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (!input.password) return { ok: false, error: "Please enter your password." };

  try {
    const token = await exchangeToken(
      "/auth/customer/emailpass",
      email,
      input.password,
    );
    await setAuthToken(token);
    try {
      const { customer } = await sdk.store.customer.retrieve(
        {},
        { Authorization: `Bearer ${token}` },
      );
      return { ok: true, customer: toAuthCustomer(customer) };
    } catch (error) {
      // Don't leave a cookie we couldn't validate.
      await clearAuthToken();
      throw error;
    }
  } catch (error) {
    logger.error("[auth] login failed:", error);
    return { ok: false, error: friendlyError(error, "Could not log in. Please try again.") };
  }
}

export async function signup(input: {
  email: string;
  password: string;
  first_name?: string;
}): Promise<AuthResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Please enter a valid email address." };
  if (input.password.length < MIN_PASSWORD_LENGTH)
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };

  try {
    const registerToken = await exchangeToken(
      "/auth/customer/emailpass/register",
      email,
      input.password,
    );
    await sdk.store.customer.create(
      { email, first_name: input.first_name?.trim() || undefined },
      {},
      { Authorization: `Bearer ${registerToken}` },
    );
    // The register token isn't a session token — log in to get the real one.
    return await login({ email, password: input.password });
  } catch (error) {
    logger.error("[auth] signup failed:", error);
    return { ok: false, error: friendlyError(error, "Could not create your account. Please try again.") };
  }
}

export async function logout(): Promise<void> {
  await clearAuthToken();
}
