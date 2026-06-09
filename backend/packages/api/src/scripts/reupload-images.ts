import { ExecArgs } from "@medusajs/framework/types";
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils";
import {
  uploadFilesWorkflow,
  updateProductsWorkflow,
} from "@medusajs/medusa/core-flows";
import { PACKS_MODULE } from "../modules/packs";
import type PacksModuleService from "../modules/packs/service";
import fs from "fs";
import path from "path";

// reupload-images — host the seeded card/pack art on the BACKEND.
//
// The catalog was cloned with `image` values pointing at storefront-relative
// paths (/cdn, /home, /images) that only resolve when the storefront serves
// public/. This re-uploads each referenced file through the Medusa file module
// (the same path /admin/uploads uses) and repoints the records to the returned
// backend URL (http://<backend>/static/...), so images load wherever the backend
// runs — no storefront dependency.
//
// IMAGE FIELDS ONLY: updates Card.image (+ its mirrored Product thumbnail/images)
// and Pack.image. Does NOT touch price/title/status (so the marketplace listing
// price isn't disturbed). Idempotent: rows whose image is already an absolute
// http(s) URL are skipped, so it's safe to re-run.
//
// Run: `corepack yarn medusa exec ./src/scripts/reupload-images.ts`

const PUBLIC_CANDIDATES = [
  path.resolve(process.cwd(), "../../../public"),
  path.resolve(process.cwd(), "../../public"),
];

const isRelative = (u?: string | null): u is string =>
  typeof u === "string" && u.startsWith("/");

const mimeOf = (f: string): string => {
  const ext = f.toLowerCase().split(".").pop();
  switch (ext) {
    case "webp":
      return "image/webp";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "avif":
      return "image/avif";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
};

export default async function reuploadImages({ container }: ExecArgs) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER);
  const packs = container.resolve<PacksModuleService>(PACKS_MODULE);
  const productModule = container.resolve(Modules.PRODUCT);

  const publicDir =
    PUBLIC_CANDIDATES.find((p) => fs.existsSync(path.join(p, "cdn"))) ??
    PUBLIC_CANDIDATES[0];
  logger.info(`Using storefront public dir: ${publicDir}`);

  const cache = new Map<string, string>(); // relative path -> uploaded url
  const missing = new Set<string>();

  async function uploadRelative(rel: string): Promise<string | null> {
    const cached = cache.get(rel);
    if (cached) return cached;
    const filePath = path.join(publicDir, rel);
    if (!fs.existsSync(filePath)) {
      missing.add(rel);
      return null;
    }
    const content = fs.readFileSync(filePath).toString("base64");
    const { result } = await uploadFilesWorkflow(container).run({
      input: {
        files: [
          {
            filename: path.basename(rel),
            mimeType: mimeOf(rel),
            content,
            access: "public",
          },
        ],
      },
    });
    const url = result?.[0]?.url ?? null;
    if (url) cache.set(rel, url);
    return url;
  }

  // --- Cards (+ their mirrored Products) ---
  const cards = await packs.listCards({}, { take: 1000 });
  const handles = cards.map((c) => c.handle);
  const products = handles.length
    ? await productModule.listProducts({ handle: handles }, { take: handles.length })
    : [];
  const productByHandle = new Map(products.map((p) => [p.handle, p]));

  let cardCount = 0;
  let productCount = 0;
  for (const card of cards) {
    if (!isRelative(card.image)) continue;
    const url = await uploadRelative(card.image);
    if (!url) continue;
    await packs.updateCards([{ id: card.id, image: url }]);
    cardCount++;
    const product = productByHandle.get(card.handle);
    if (product) {
      await updateProductsWorkflow(container).run({
        input: { products: [{ id: product.id, thumbnail: url, images: [{ url }] }] },
      });
      productCount++;
    }
  }

  // --- Packs ---
  const packList = await packs.listPacks({}, { take: 1000 });
  let packCount = 0;
  for (const pack of packList) {
    if (!isRelative(pack.image)) continue;
    const url = await uploadRelative(pack.image);
    if (!url) continue;
    await packs.updatePacks([{ id: pack.id, image: url }]);
    packCount++;
  }

  logger.info(
    `Reupload complete: ${cache.size} unique file(s) uploaded; repointed ${cardCount} card(s) + ${productCount} product(s) + ${packCount} pack(s).`
  );
  if (missing.size) {
    logger.warn(
      `Skipped ${missing.size} card/pack(s) — source file not found under public/: ${[...missing].join(", ")}`
    );
  }
}
