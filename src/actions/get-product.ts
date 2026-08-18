import { squarespaceRequest } from "../client.ts";

export interface GetProductInput {
  id: string;
}

/**
 * Raw product shape from Squarespace. The object shape is already
 * confirmed elsewhere (matches list-products.schema.json's $defs.product
 * exactly), but this GET-by-id endpoint has never itself been called
 * live, so whether the response is wrapped in a key (as get_contact's
 * turned out to be) or flat is unconfirmed — kept as an open record
 * rather than the schema's precise field list.
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
 * logic get_contact required — but this specific GET-by-id call has never
 * been made against the live API. Whether Squarespace exposes this
 * endpoint at all, and whether its response is wrapped in a key or flat,
 * are both UNCONFIRMED — see src/schemas/get-product.schema.json's
 * VERIFICATION STATUS.
 */
export async function getProduct(input: GetProductInput): Promise<GetProductResult> {
  assertValidInput(input);

  return squarespaceRequest<GetProductResult>(`/products/${encodeURIComponent(input.id)}`);
}
