import { squarespaceRequest } from "../client.ts";

export interface GetOrderInput {
  id: string;
}

/**
 * Raw order shape from Squarespace. The object shape is already confirmed
 * elsewhere (matches create-order.schema.json/list-orders.schema.json's
 * $defs.order exactly), but this GET-by-id endpoint has never itself been
 * called live, so whether the response is wrapped in a key (as
 * get_contact's turned out to be) or flat is unconfirmed — kept as an open
 * record rather than the schema's precise field list.
 */
export type GetOrderResult = Record<string, unknown>;

/**
 * Validates the one field src/schemas/get-order.schema.json marks
 * required — id — before any request is sent.
 */
function assertValidInput(input: Partial<GetOrderInput> | null | undefined): void {
  if (!input || typeof input.id !== "string" || input.id.trim() === "") {
    throw new Error("getOrder: id is required.");
  }
}

/**
 * Retrieves a single order by id (squarespace.get_order).
 *
 * GET /orders/{id} against the commerce base
 * (https://api.squarespace.com/1.0/commerce). Unlike the contacts base,
 * COMMERCE_BASE_URL does not already end in /orders, so client.ts's
 * resolveUrl() appends the segment normally without needing the dedup
 * logic get_contact required — but this specific GET-by-id call has never
 * been made against the live API. Whether Squarespace exposes this
 * endpoint at all, and whether its response is wrapped in a key or flat,
 * are both UNCONFIRMED — see src/schemas/get-order.schema.json's
 * VERIFICATION STATUS.
 */
export async function getOrder(input: GetOrderInput): Promise<GetOrderResult> {
  assertValidInput(input);

  return squarespaceRequest<GetOrderResult>(`/orders/${encodeURIComponent(input.id)}`);
}
