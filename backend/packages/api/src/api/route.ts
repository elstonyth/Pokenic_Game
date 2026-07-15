import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';

// Root landing (GET /). The backend is a headless Medusa/Mercur server with no
// page at "/", so hitting the bare origin (admin.polycards.gg) returned Express's
// default "Cannot GET /" 404. The only human-facing surface here is the admin
// dashboard at /dashboard (which itself 301s to /dashboard/login when signed
// out), so send the root there. 302 (not 301): the target is an internal path we
// may later repoint, and a 301 would be cached past that change.
export async function GET(_req: MedusaRequest, res: MedusaResponse) {
  res.redirect(302, '/dashboard');
}
