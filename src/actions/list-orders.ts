import { squarespaceRequest } from "../client.ts";

/** UNVERIFIED enum members — see src/schemas/list-orders.schema.json. */
export type FulfillmentStatus = "PENDING" | "FULFILLED" | "CANCELED";

export interface ListOrdersInput {
  cursor?: string;
  limit?: number;
  modifiedAfter?: string;
  modifiedBefore?: string;
  fulfillmentStatus?: FulfillmentStatus;
}

export interface Pagination {
  nextPageCursor: string | null;
  nextPageUrl: string | null;
  hasNextPage: boolean;
}

export interface ListOrdersResult {
  orders: unknown[];
  pagination: Pagination;
}

/** Shape of the raw GET /orders response — top-level array key is `result`, not `orders`. */
interface ListOrdersResponse {
  result?: unknown[];
  pagination?: Partial<Pagination>;
}

/**
 * Validates the two paging rules CONFIRMED live, 2026-08-16, against real
 * Squarespace behavior (see src/schemas/list-orders.schema.json — all four
 * cursor combinations were tested directly against the API, not inferred):
 *
 * 1. `cursor` excludes `modifiedAfter`, `modifiedBefore`, and
 *    `fulfillmentStatus` specifically — each combination was rejected with
 *    400 INVALID_REQUEST_ERROR.INVALID_ARGUMENT, "Cursor cannot be set while
 *    other parameters are present." `limit` is NOT excluded — cursor +
 *    limit was confirmed to succeed. (Narrower than list_products' confirmed
 *    rule that cursor must be the only parameter sent — don't conflate the
 *    two endpoints.)
 * 2. `modifiedAfter` and `modifiedBefore` must both be present or both be
 *    absent — a one-sided window was rejected with 400
 *    INVALID_REQUEST_ERROR.MISSING_ARGUMENT, "'modifiedBefore' and
 *    'modifiedAfter' must both be specified." This pairing requirement was
 *    previously removed from validation as unconfirmed; live evidence has
 *    now reinstated it.
 */
function assertValidInput(input: ListOrdersInput): void {
  const hasModifiedAfter = input.modifiedAfter !== undefined;
  const hasModifiedBefore = input.modifiedBefore !== undefined;

  if (hasModifiedAfter !== hasModifiedBefore) {
    throw new Error(
      "listOrders: `modifiedAfter` and `modifiedBefore` must both be present or both be " +
        "absent — confirmed live, Squarespace rejects a one-sided window with 400 " +
        "INVALID_REQUEST_ERROR.MISSING_ARGUMENT, \"'modifiedBefore' and 'modifiedAfter' must " +
        'both be specified."',
    );
  }

  const hasCursor = input.cursor !== undefined;
  const hasFulfillmentStatus = input.fulfillmentStatus !== undefined;

  if (hasCursor && (hasModifiedAfter || hasModifiedBefore || hasFulfillmentStatus)) {
    throw new Error(
      "listOrders: `cursor` cannot be combined with `modifiedAfter`, `modifiedBefore`, or " +
        "`fulfillmentStatus` — confirmed live, Squarespace rejects the combination with 400 " +
        'INVALID_REQUEST_ERROR.INVALID_ARGUMENT, "Cursor cannot be set while other parameters ' +
        'are present." `limit` is unaffected and may be combined with `cursor`.',
    );
  }
}

/** Lists orders (squarespace.list_orders). */
export async function listOrders(
  input: ListOrdersInput = {},
): Promise<ListOrdersResult> {
  assertValidInput(input);

  const params = new URLSearchParams();
  if (input.cursor !== undefined) params.set("cursor", input.cursor);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  if (input.modifiedAfter !== undefined) params.set("modifiedAfter", input.modifiedAfter);
  if (input.modifiedBefore !== undefined) params.set("modifiedBefore", input.modifiedBefore);
  if (input.fulfillmentStatus !== undefined) {
    params.set("fulfillmentStatus", input.fulfillmentStatus);
  }

  const query = params.toString();
  const response = await squarespaceRequest<ListOrdersResponse>(
    query ? `/orders?${query}` : "/orders",
  );

  return {
    orders: response.result ?? [],
    pagination: {
      nextPageCursor: response.pagination?.nextPageCursor ?? null,
      nextPageUrl: response.pagination?.nextPageUrl ?? null,
      hasNextPage: response.pagination?.hasNextPage ?? false,
    },
  };
}
