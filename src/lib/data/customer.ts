/**
 * Server-side customer/session helpers.
 *
 * The customer JWT lives in an httpOnly cookie (not localStorage — XSS-safe per
 * the security rules) and is read only on the server. All Store-API auth calls
 * run server-side (server actions / route handlers / server components), which
 * also sidesteps browser CORS — the backend's AUTH/STORE CORS doesn't list the
 * storefront's verify origin (:4000), but server→backend requests aren't subject
 * to it. The client learns the auth state via the same-origin `/api/me` route.
 */
import "server-only";
import { cookies } from "next/headers";
import type { HttpTypes } from "@medusajs/types";
import { sdk } from "@/lib/medusa";

const AUTH_COOKIE = "_pokenic_jwt";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

/** Persist the customer JWT (call only from a server action or route handler). */
export async function setAuthToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
}

/** Clear the customer JWT (call only from a server action or route handler). */
export async function clearAuthToken(): Promise<void> {
  const store = await cookies();
  store.delete(AUTH_COOKIE);
}

async function getAuthToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(AUTH_COOKIE)?.value;
}

/** The logged-in customer (from the httpOnly JWT cookie), or null if logged out. */
export async function getCustomer(): Promise<HttpTypes.StoreCustomer | null> {
  const token = await getAuthToken();
  if (!token) return null;
  try {
    const { customer } = await sdk.store.customer.retrieve(
      {},
      { Authorization: `Bearer ${token}` },
    );
    return customer;
  } catch {
    // Expired/invalid token — treat as logged out.
    return null;
  }
}
