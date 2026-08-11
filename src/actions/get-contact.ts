import { squarespaceRequest } from "../client.ts";

export interface GetContactInput {
  id: string;
}

/**
 * Raw contact shape from Squarespace. CONFIRMED live, 2026-08-11, against
 * one real contact: the response is wrapped in a top-level `contact` key
 * (not flat), with `primaryEmail.{email, acceptsMarketing}` in place of the
 * earlier modeled flat `email`/`transactionalEmailStatus`, plus `locale`
 * and `defaultShippingAddress`. See get-contact.schema.json's `contact`
 * $def for the field-by-field breakdown. Kept as an open record rather than
 * the schema's precise field list — only one real record has been
 * observed, so an unexpected field on another contact should still pass
 * through instead of being silently dropped.
 */
export type GetContactResult = Record<string, unknown>;

/**
 * Validates the one field src/schemas/get-contact.schema.json marks
 * required — id — before any request is sent.
 */
function assertValidInput(input: Partial<GetContactInput> | null | undefined): void {
  if (!input || typeof input.id !== "string" || input.id.trim() === "") {
    throw new Error("getContact: id is required.");
  }
}

/**
 * Retrieves a single contact by id (squarespace.get_contact).
 *
 * GET /contacts/{id} against the contacts base
 * (https://api.squarespace.com/v1/contacts). That base already ends in the
 * /contacts collection segment, so client.ts's resolveUrl() treats it as
 * the collection root and appends only the id — it does NOT double the
 * segment into /contacts/contacts/{id}.
 *
 * CONFIRMED live, 2026-08-11: resolveUrl() produces exactly
 * https://api.squarespace.com/v1/contacts/{id}, and a request to that URL
 * reaches the real API and gets a proper business-logic response (404 for
 * a nonexistent id, 200 with a real Contact for a real one) rather than a
 * 401 — auth and URL resolution both work. The response SHAPE is now also
 * CONFIRMED live, 2026-08-11, against one real contact — see
 * get-contact.schema.json's VERIFICATION STATUS for the full diff against
 * the earlier (wrong) placeholder model.
 */
export async function getContact(input: GetContactInput): Promise<GetContactResult> {
  assertValidInput(input);

  return squarespaceRequest<GetContactResult>(`/contacts/${encodeURIComponent(input.id)}`);
}
