import { NextResponse } from "next/server";
import { getCustomer } from "@/lib/data/customer";

// Same-origin endpoint the client AuthProvider polls once on mount to learn the
// logged-in customer — the browser can't read the httpOnly JWT cookie directly,
// and a direct Store-API call from :4000 would be CORS-blocked.
export async function GET() {
  const customer = await getCustomer();
  return NextResponse.json({
    customer: customer
      ? {
          id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
        }
      : null,
  });
}
