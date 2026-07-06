import type {
  MedusaNextFunction,
  MedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { MedusaError } from '@medusajs/framework/utils';

// Medusa's stock update-customer route accepts arbitrary `metadata`. This app
// stores server-validated state in customer metadata (avatar_url,
// equipped_frame_level — written ONLY by /store/profile/avatar|frame, plus the
// backend-assigned handle), so client-supplied metadata would be a validation
// bypass (equip a locked frame, inject any avatar URL). Reject the whole
// field — fail-closed for future reserved keys; the storefront never sends
// metadata on profile updates.
export function rejectCustomerMetadata(
  req: MedusaRequest,
  _res: MedusaResponse,
  next: MedusaNextFunction,
): void {
  const body = req.body as Record<string, unknown> | null | undefined;
  if (body && typeof body === 'object' && 'metadata' in body) {
    next(
      new MedusaError(
        MedusaError.Types.INVALID_DATA,
        'metadata is not updatable on this route.',
      ),
    );
    return;
  }
  next();
}
