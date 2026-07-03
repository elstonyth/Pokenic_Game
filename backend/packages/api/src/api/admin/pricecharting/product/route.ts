import { MedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { pcFetch, PC_TOKEN_MISSING } from '../client';
import { resolvePcImageUrl } from '../product-image';
import { PRICE_FIELDS } from '../../../../modules/packs/pricecharting-grades';

// GET /admin/pricecharting/product?id=… — per-grade values for one PriceCharting
// product. Upstream returns integer PENNIES in fields whose card-grade meaning is
// documented in their key table (loose=Ungraded, graded=Grade 9, box-only=9.5,
// manual-only=PSA 10, bgs-10=BGS 10, condition-17=CGC 10, condition-18=SGC 10,
// cib=Grade 7/7.5, new=Grade 8/8.5). Returned here as USD decimals, ready to
// drop into the card's market_value.
type PcProductResponse = {
  status: string;
  'error-message'?: string;
  id?: string | number;
  'product-name'?: string;
  'console-name'?: string;
  image?: string;
  'loose-price'?: number;
  'cib-price'?: number;
  'new-price'?: number;
  'graded-price'?: number;
  'box-only-price'?: number;
  'manual-only-price'?: number;
  'bgs-10-price'?: number;
  'condition-17-price'?: number;
  'condition-18-price'?: number;
};

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse,
): Promise<void> {
  const id = typeof req.query.id === 'string' ? req.query.id.trim() : '';
  if (!id) {
    res.status(400).json({ message: "Query parameter 'id' is required." });
    return;
  }

  // Prices come from the token'd API; the card photo is scraped from PC's
  // public product page in parallel (the API returns no image). The scrape is
  // best-effort — resolvePcImageUrl swallows failures to null — so it can never
  // break the price lookup. Its timeout is deliberately tighter than the API's,
  // so a slow offers page can add at most that bounded delay; usually both
  // finish together and the scrape adds nothing.
  const [result, scrapedImage] = await Promise.all([
    pcFetch<PcProductResponse>('/api/product', { id }),
    resolvePcImageUrl(id),
  ]);
  if (result.kind === 'no-token') {
    res.status(503).json({ message: PC_TOKEN_MISSING });
    return;
  }
  if (result.kind === 'error') {
    res.status(502).json({ message: result.message });
    return;
  }

  const prices = PRICE_FIELDS.flatMap(([field, label]) => {
    const pennies = result.data[field];
    if (
      typeof pennies !== 'number' ||
      !Number.isFinite(pennies) ||
      pennies <= 0
    ) {
      return [];
    }
    return [{ grade: label, usd: Math.round(pennies) / 100 }];
  });

  // Card photo: the scraped product-page image (…/images.pricecharting.com/
  // <hash>/240.jpg), which the admin previews and the create flow ingests via
  // the media pipeline. Falls back to the API's `image` field on the off chance
  // upstream ever populates it (today it's always null).
  const apiImage =
    typeof result.data.image === 'string' &&
    /^https:\/\//.test(result.data.image)
      ? result.data.image
      : null;
  const image = scrapedImage ?? apiImage;

  res.json({
    product: {
      id: String(result.data.id ?? id),
      name: result.data['product-name'] ?? '',
      set: result.data['console-name'] ?? '',
      image,
      prices,
    },
  });
}
