import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { pcFetch, PC_TOKEN_MISSING } from "../client";

// GET /admin/pricecharting/search?q=… — proxy PriceCharting's /api/products full
// text search (up to 20 best matches). Proxied server-side so the paid API token
// (PRICECHARTING_API_TOKEN) never reaches the browser. Admin-auth protected like
// every /admin/* route. Matches carry no prices — the editor fetches per-grade
// values via /admin/pricecharting/product?id=… after the operator picks one.
type PcSearchResponse = {
  status: string;
  "error-message"?: string;
  products?: Array<{
    id: string | number;
    "product-name"?: string;
    "console-name"?: string;
  }>;
};

export async function GET(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.status(400).json({ message: "Query parameter 'q' is required." });
    return;
  }

  const result = await pcFetch<PcSearchResponse>("/api/products", { q });
  if (result.kind === "no-token") {
    res.status(503).json({ message: PC_TOKEN_MISSING });
    return;
  }
  if (result.kind === "error") {
    res.status(502).json({ message: result.message });
    return;
  }

  const matches = (result.data.products ?? []).map((p) => ({
    id: String(p.id),
    name: p["product-name"] ?? "",
    set: p["console-name"] ?? "",
  }));

  res.json({ matches });
}
