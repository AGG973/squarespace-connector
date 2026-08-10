import { randomUUID } from "node:crypto";
import { squarespaceRequest } from "../client.ts";

export interface Pagination {
  nextPageCursor: string | null;
  nextPageUrl: string | null;
  hasNextPage: boolean;
}

/**
 * Shared shape for incrementOperations and setFiniteOperations, though the
 * valid range of `quantity` differs by which array it's in: incrementOperations
 * requires >= 1 (enforced in assertValidAdjustment below — see its comment),
 * setFiniteOperations allows >= 0 since it sets an absolute level.
 */
export interface VariantQuantityOperation {
  variantId: string;
  quantity: number;
}

export interface VariantOperation {
  variantId: string;
}

export interface GetOrAdjustInventoryInput {
  /** Read mode only. */
  cursor?: string;
  limit?: number;
  /** Write mode only. Reused verbatim if supplied; generated fresh otherwise. */
  idempotencyKey?: string;
  /** Presence of any of these three switches this call to write mode. */
  incrementOperations?: VariantQuantityOperation[];
  setFiniteOperations?: VariantQuantityOperation[];
  setUnlimitedOperations?: VariantOperation[];
}

export interface GetInventoryResult {
  inventory: unknown[];
  pagination: Pagination;
}

export interface AdjustInventoryResult {
  adjusted: boolean;
  /** The Idempotency-Key actually sent — the caller's if supplied, otherwise the generated one. */
  idempotencyKey: string;
}

export type GetOrAdjustInventoryResult = GetInventoryResult | AdjustInventoryResult;

/** Shape of the raw GET /inventory response. Confirmed against fixtures/inventory.json. */
interface GetInventoryResponse {
  inventory?: unknown[];
  pagination?: Partial<Pagination>;
}

/**
 * UNVERIFIED — modelled on the documented Squarespace adjustments endpoint
 * (src/schemas/get-or-adjust-inventory.schema.json), not yet confirmed live.
 * The endpoint may also answer 204 No Content, in which case
 * squarespaceRequest resolves `undefined` rather than this shape.
 */
interface AdjustInventoryResponse {
  adjusted?: boolean;
}

function hasAdjustments(input: GetOrAdjustInventoryInput): boolean {
  return (
    (input.incrementOperations?.length ?? 0) > 0 ||
    (input.setFiniteOperations?.length ?? 0) > 0 ||
    (input.setUnlimitedOperations?.length ?? 0) > 0
  );
}

/**
 * incrementOperations only adds stock — confirmed live (2026-08-10):
 * Squarespace responds 400 INVALID_REQUEST_ERROR ("quantity must be between
 * 1 and 1000000000, inclusive.") for quantity < 1. There is no
 * decrement-via-increment; reject locally rather than round-tripping to
 * find that out. To reduce stock, use setFiniteOperations with an absolute
 * target quantity instead.
 */
function assertValidAdjustment(input: GetOrAdjustInventoryInput): void {
  const hasInvalidQuantity = input.incrementOperations?.some((op) => op.quantity < 1);
  if (hasInvalidQuantity) {
    throw new Error(
      "getOrAdjustInventory: incrementOperations only adds stock — quantity must be >= 1 " +
        "(Squarespace rejects lower values). To reduce stock, use setFiniteOperations with " +
        "an absolute target quantity instead.",
    );
  }
}

async function getInventory(input: GetOrAdjustInventoryInput): Promise<GetInventoryResult> {
  const params = new URLSearchParams();
  if (input.cursor !== undefined) params.set("cursor", input.cursor);
  if (input.limit !== undefined) params.set("limit", String(input.limit));

  const query = params.toString();
  const response = await squarespaceRequest<GetInventoryResponse>(
    query ? `/inventory?${query}` : "/inventory",
  );

  return {
    inventory: response.inventory ?? [],
    pagination: {
      nextPageCursor: response.pagination?.nextPageCursor ?? null,
      nextPageUrl: response.pagination?.nextPageUrl ?? null,
      hasNextPage: response.pagination?.hasNextPage ?? false,
    },
  };
}

async function adjustInventory(input: GetOrAdjustInventoryInput): Promise<AdjustInventoryResult> {
  assertValidAdjustment(input);

  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  const body: Record<string, unknown> = {};
  if (input.incrementOperations) body.incrementOperations = input.incrementOperations;
  if (input.setFiniteOperations) body.setFiniteOperations = input.setFiniteOperations;
  if (input.setUnlimitedOperations) body.setUnlimitedOperations = input.setUnlimitedOperations;

  const response = await squarespaceRequest<AdjustInventoryResponse | undefined>(
    "/inventory/adjustments",
    {
      method: "POST",
      body,
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );

  return {
    adjusted: response?.adjusted ?? true,
    idempotencyKey,
  };
}

/**
 * Reads current inventory levels, or submits a stock adjustment
 * (squarespace.get_or_adjust_inventory).
 *
 * Mode is inferred from the input rather than an explicit flag: any of
 * incrementOperations/setFiniteOperations/setUnlimitedOperations present
 * switches to write mode (POST /inventory/adjustments, Idempotency-Key
 * header required); otherwise this reads (GET /inventory).
 *
 * The write path is UNVERIFIED against the live API — see the schema's
 * VERIFICATION STATUS note — so treat its exact request/response shape as
 * provisional until a real adjustment has been confirmed.
 */
export async function getOrAdjustInventory(
  input: GetOrAdjustInventoryInput = {},
): Promise<GetOrAdjustInventoryResult> {
  return hasAdjustments(input) ? adjustInventory(input) : getInventory(input);
}
