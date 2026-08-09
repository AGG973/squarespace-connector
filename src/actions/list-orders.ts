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
 * Validates the one paging rule confirmed against real Squarespace behavior
 * (see src/schemas/list-orders.schema.json): `cursor` and the
 * `modifiedAfter`/`modifiedBefore` time-range window are two different paging
 * strategies and can't be combined. `limit` and `fulfillmentStatus` are
 * unaffected, and modifiedAfter/modifiedBefore are not required to be paired —
 * neither restriction is confirmed against the live API.
 */
function assertValidInput(input: ListOrdersInput): void {
  const hasCursor = input.cursor !== undefined;
  const hasDateRange = input.modifiedAfter !== undefined || input.modifiedBefore !== undefined;

  if (hasCursor && hasDateRange) {
    throw new Error(
      "listOrders: `cursor` cannot be combined with `modifiedAfter`/`modifiedBefore` — " +
        "cursor and the time-range window are mutually exclusive paging strategies.",
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
