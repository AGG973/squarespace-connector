import { squarespaceRequest } from "../client.ts";

export interface ListContactsInput {
  cursor?: string;
}

export interface Pagination {
  nextPageCursor: string | null;
  nextPageUrl: string | null;
  hasNextPage: boolean;
}

export interface ListContactsResult {
  contacts: unknown[];
  pagination: Pagination;
}

/** Shape of the raw GET /contacts response — top-level array key is `contacts`. */
interface ListContactsResponse {
  contacts?: unknown[];
  pagination?: Partial<Pagination>;
}

/**
 * Lists contacts (squarespace.list_contacts).
 *
 * GET /contacts on the contacts base (https://api.squarespace.com/v1/contacts).
 * The envelope (`contacts` array key + `pagination`) and per-contact shape are
 * CONFIRMED — see src/schemas/list-contacts.schema.json's VERIFICATION
 * STATUS — but this endpoint's own cursor behavior has not itself been
 * exercised live, so no cursor-combination validation is applied here beyond
 * what the schema documents as unconfirmed.
 */
export async function listContacts(
  input: ListContactsInput = {},
): Promise<ListContactsResult> {
  const params = new URLSearchParams();
  if (input.cursor !== undefined) params.set("cursor", input.cursor);

  const query = params.toString();
  const response = await squarespaceRequest<ListContactsResponse>(
    query ? `/contacts?${query}` : "/contacts",
  );

  return {
    contacts: response.contacts ?? [],
    pagination: {
      nextPageCursor: response.pagination?.nextPageCursor ?? null,
      nextPageUrl: response.pagination?.nextPageUrl ?? null,
      hasNextPage: response.pagination?.hasNextPage ?? false,
    },
  };
}
