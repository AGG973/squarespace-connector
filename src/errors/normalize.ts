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

/** Squarespace's raw error body: `{ type, subtype, message, contextId }`. */
interface SquarespaceRawError {
  type?: string;
  subtype?: string;
  message?: string;
  contextId?: string;
}

function isRawError(value: unknown): value is SquarespaceRawError {
  return typeof value === "object" && value !== null;
}

/**
 * Normalizes a Squarespace error response into `{ code, message, httpStatus,
 * requestId, retryable }`.
 *
 * `rawBody` is treated defensively — if Squarespace ever returns a body that
 * isn't the documented `{ type, subtype, message, contextId }` shape (e.g. a
 * gateway error), the fields it's missing fall back rather than throwing.
 */
export function normalizeError(
  httpStatus: number,
  rawBody: unknown,
  fallbackRequestId?: string,
): NormalizedError {
  const raw = isRawError(rawBody) ? rawBody : {};

  const type = raw.type ?? "unknown_error";
  const subtype = raw.subtype ?? "unknown";

  return {
    code: `${type}.${subtype}`,
    message: raw.message ?? `Squarespace request failed with HTTP ${httpStatus}`,
    httpStatus,
    requestId: raw.contextId ?? fallbackRequestId ?? randomUUID(),
    retryable: httpStatus === 429 || (httpStatus >= 500 && httpStatus < 600),
  };
}
