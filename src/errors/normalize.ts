import { randomUUID } from "node:crypto";

/**
 * Normalized error shape produced from Squarespace's raw error body, per the
 * `error_handling` mapping documented in connector.yaml.
 */
export interface NormalizedError {
  code: string;
  message: string;
  httpStatus: number;
  requestId: string;
  retryable: boolean;
}

/** Squarespace's original documented error body: `{ type, subtype, message, details, contextId }`. */
interface SquarespaceRawError {
  type?: string;
  subtype?: string;
  message?: string;
  /** Present on some responses; not currently mapped into NormalizedError — no documented use for it yet. */
  details?: unknown;
  contextId?: string;
}

/**
 * CONFIRMED live, 2026-08-17 — a second, distinct error shape Squarespace
 * actually returns: RFC 7807 problem+json, e.g. `{ type: "about:blank",
 * title: "Bad Request", status: 400, detail: "Required header
 * 'Idempotency-Key' is not present.", instance: "/1.0/commerce/orders" }`.
 * Observed specifically on the missing-Idempotency-Key rejection for both
 * create_order and adjust_inventory — likely a gateway/edge-level rejection
 * that never reaches Squarespace's application-level error formatting
 * (hence the different shape from SquarespaceRawError above). Has no
 * `contextId`, unlike the original shape — that absence, alongside the
 * presence of `detail`/`title`/`status`, is how isProblemJsonError below
 * tells the two apart.
 */
interface ProblemJsonError {
  [key: string]: unknown;
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
}

function isRawError(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Distinguishes the RFC 7807 problem+json shape from Squarespace's original
 * `{ type, subtype, message, details, contextId }` shape: problem+json never
 * has `contextId`, and carries at least one of `detail`/`title`/`status`
 * instead. CONFIRMED live, 2026-08-17, against a real problem+json response
 * (see ProblemJsonError's comment) — not inferred from RFC 7807's spec alone.
 */
function isProblemJsonError(value: Record<string, unknown>): value is ProblemJsonError {
  return !("contextId" in value) && ("detail" in value || "title" in value || "status" in value);
}

/**
 * Normalizes a Squarespace error response into `{ code, message, httpStatus,
 * requestId, retryable }`. Squarespace is CONFIRMED, 2026-08-17, to use (at
 * least) two distinct error body shapes depending on the failure — see
 * SquarespaceRawError and ProblemJsonError above — so this checks for the
 * problem+json shape first and falls back to the original shape otherwise.
 *
 * `rawBody` is treated defensively — if it matches neither documented shape
 * (e.g. an entirely different gateway error), the fields it's missing fall
 * back rather than throwing.
 */
export function normalizeError(
  httpStatus: number,
  rawBody: unknown,
  fallbackRequestId?: string,
): NormalizedError {
  const raw: Record<string, unknown> = isRawError(rawBody) ? rawBody : {};

  if (isProblemJsonError(raw)) {
    return {
      code: raw.title ?? "unknown_error",
      message: raw.detail ?? `Squarespace request failed with HTTP ${httpStatus}`,
      httpStatus,
      // problem+json responses have no contextId — fall back same as any
      // other missing-requestId case.
      requestId: fallbackRequestId ?? randomUUID(),
      retryable: httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600),
    };
  }

  const original = raw as SquarespaceRawError;
  const type = original.type ?? "unknown_error";
  const subtype = original.subtype ?? "unknown";

  return {
    code: `${type}.${subtype}`,
    message: original.message ?? `Squarespace request failed with HTTP ${httpStatus}`,
    httpStatus,
    requestId: original.contextId ?? fallbackRequestId ?? randomUUID(),
    retryable: httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600),
  };
}
