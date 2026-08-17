import { squarespaceRequest } from "../client.ts";

export interface ListProductsInput {
  cursor?: string;
  limit?: number;
}

export interface Pagination {
  nextPageCursor: string | null;
  nextPageUrl: string | null;
  hasNextPage: boolean;
}

export interface ListProductsResult {
  products: unknown[];
  pagination: Pagination;
}

/** Shape of the raw GET /products response — top-level array key is `products`. */
interface ListProductsResponse {
  products?: unknown[];
  pagination?: Partial<Pagination>;
}

/**
 * Lists products from the store catalog (squarespace.list_products).
 *
 * No client-side cursor/limit validation here: this endpoint was previously
 * assumed to reject cursor combined with any other parameter, but that
 * assumption is CONFIRMED DISPROVEN live, 2026-08-16 — cursor + limit
 * succeeds (see src/schemas/list-products.schema.json and connector.yaml).
 */
export async function listProducts(
  input: ListProductsInput = {},
): Promise<ListProductsResult> {
  const params = new URLSearchParams();
  if (input.cursor !== undefined) params.set("cursor", input.cursor);
  if (input.limit !== undefined) params.set("limit", String(input.limit));

  const query = params.toString();
  const response = await squarespaceRequest<ListProductsResponse>(
    query ? `/products?${query}` : "/products",
  );

  return {
    products: response.products ?? [],
    pagination: {
      nextPageCursor: response.pagination?.nextPageCursor ?? null,
      nextPageUrl: response.pagination?.nextPageUrl ?? null,
      hasNextPage: response.pagination?.hasNextPage ?? false,
    },
  };
}
