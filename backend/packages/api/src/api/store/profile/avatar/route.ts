import path from 'path';
import type {
  AuthenticatedMedusaRequest,
  MedusaResponse,
} from '@medusajs/framework/http';
import { MedusaError, Modules } from '@medusajs/framework/utils';
import { uploadFilesWorkflow } from '@medusajs/medusa/core-flows';
import sharp from 'sharp';
import { validateImage } from '../../../admin/media/validate';

// Tighter than the shared 20 MB multer edge cap — avatars are small.
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

// POST /store/profile/avatar — the logged-in customer's profile photo.
// Same validation pipeline as /admin/media (declared-type allowlist +
// magic-byte sniff + dimension gates, 'avatar' profile) with a 5 MB cap.
// Stores the original via the configured file provider and writes
// customer.metadata.avatar_url. Metadata is MERGED (read-modify-write) so
// equipping a frame and changing the photo never clobber each other; the
// stock POST /store/customers/me rejects client metadata, so these keys are
// written only here and in /store/profile/frame.
export async function POST(
  req: AuthenticatedMedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const customerId = req.auth_context?.actor_id;
  if (!customerId) {
    throw new MedusaError(MedusaError.Types.UNAUTHORIZED, 'Unauthorized');
  }

  const files = (req.files as UploadedFile[] | undefined) ?? [];
  const file = files[0];
  if (!file) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, 'No file uploaded.');
  }
  if (file.size > AVATAR_MAX_BYTES) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'Profile photos are capped at 5 MB.',
    );
  }

  let meta: sharp.Metadata;
  try {
    meta = await sharp(file.buffer).metadata();
  } catch {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      'Could not read the image — is it a valid image file?',
    );
  }
  const verdict = validateImage(
    {
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      bytes: file.size,
      mimeType: file.mimetype,
      detectedFormat: meta.format,
      frames: meta.pages ?? 1,
    },
    'avatar',
  );
  if (!verdict.ok) {
    throw new MedusaError(MedusaError.Types.INVALID_DATA, verdict.message);
  }

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: [
        {
          // Strip path components a crafted multipart filename might carry
          // (same guard as /admin/media).
          filename: path.basename(file.originalname.replace(/\\/g, '/')),
          mimeType: file.mimetype,
          content: file.buffer.toString('base64'),
          access: 'public',
        },
      ],
    },
  });
  const url = result?.[0]?.url;
  if (!url) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      'Upload returned no file URL.',
    );
  }

  const customers = req.scope.resolve(Modules.CUSTOMER);
  const customer = await customers.retrieveCustomer(customerId);
  await customers.updateCustomers(customerId, {
    metadata: { ...(customer.metadata ?? {}), avatar_url: url },
  });

  res.json({ avatar_url: url });
}
