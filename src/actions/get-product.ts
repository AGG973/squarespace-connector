import { squarespaceRequest } from "../client.ts";

export interface GetProductInput {
  id: string;
}

/**
 * Raw response shape from Squarespace. CONFIRMED live, 2026-08-19: this is
 * `{ products: [ {...} ] }` — the same top-level `products` array key
 * list_products uses, holding a single-item array, with no `pagination`
 * key. Neither of the two prior assumptions (flat, or `{ product: {...} }`
 * like get_contact) was correct — see
 * src/schemas/get-product.schema.json's VERIFICATION STATUS. Kept as an
 * open record rather than the schema's precise field list, matching
 * get-contact.ts's convention for this connector's other GET-by-id
 * actions.
 */
export type GetProductResult = Record<string, unknown>;

/**
 * Validates the one field src/schemas/get-product.schema.json marks
 * required — id — before any request is sent.
 */
function assertValidInput(input: Partial<GetProductInput> | null | undefined): void {
  if (!input || typeof input.id !== "string" || input.id.trim() === "") {
    throw new Error("getProduct: id is required.");
  }
}

/**
 * Retrieves a single product by id (squarespace.get_product).
 *
 * GET /products/{id} against the commerce base
 * (https://api.squarespace.com/1.0/commerce). Unlike the contacts base,
 * COMMERCE_BASE_URL does not already end in /products, so client.ts's
 * resolveUrl() appends the segment normally without needing the dedup
 * logic get_contact required. CONFIRMED live, 2026-08-19, against a real
 * product id — see src/schemas/get-product.schema.json's VERIFICATION
 * STATUS for the confirmed `{ products: [...] }` envelope shape.
 */
export async function getProduct(input: GetProductInput): Promise<GetProductResult> {
  assertValidInput(input);

  return squarespaceRequest<GetProductResult>(`/products/${encodeURIComponent(input.id)}`);
}
