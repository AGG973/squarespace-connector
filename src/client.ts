/**
 * Low-level HTTP client for the Squarespace API.
 *
 * Deliberately thin: it resolves the base URL, attaches auth headers, handles
 * the documented 429 cooldown, and parses successful JSON. Error responses are
 * normalized per the `error_handling` mapping in connector.yaml (see
 * `src/errors/normalize.ts`) before being thrown.
 */

import { buildAuthHeader } from "./auth/index.ts";
import { normalizeError, type NormalizedError } from "./errors/normalize.ts";

/** Commerce API — products, orders, inventory. */
const COMMERCE_BASE_URL = "https://api.squarespace.com/1.0/commerce";

/**
 * Contacts API — note this base already includes the `/contacts` collection
 * segment, and it sits on a different API version than commerce (v1 vs 1.0).
 */
const CONTACTS_BASE_URL = "https://api.squarespace.com/v1/contacts";

const USER_AGENT = "doo-squarespace-connector/0.1";

/** Squarespace documents a fixed 60s cooldown after a 429. */
const RATE_LIMIT_COOLDOWN_MS = 60_000;

const COMMERCE_ROOTS = new Set(["products", "orders", "inventory"]);
const CONTACTS_ROOTS = new Set(["contacts"]);

export type HttpMethod = "GET" | "POST";

export interface RequestOptions {
  method?: HttpMethod;
  /** Serialized as a JSON request body. POST only. */
  body?: unknown;
  /** Extra headers, merged over the defaults. */
  headers?: Record<string, string>;
}

/**
 * Thrown for any non-2xx response that isn't resolved by the 429 retry.
 *
 * Carries the normalized `{ code, message, httpStatus, requestId, retryable }`
 * shape (see `src/errors/normalize.ts`) rather than the raw Squarespace body.
 */
export class SquarespaceError extends Error implements NormalizedError {
  readonly code: string;
  readonly httpStatus: number;
  readonly requestId: string;
  readonly retryable: boolean;

  constructor(normalized: NormalizedError) {
    super(normalized.message);
    this.name = "SquarespaceError";
    this.code = normalized.code;
    this.httpStatus = normalized.httpStatus;
    this.requestId = normalized.requestId;
    this.retryable = normalized.retryable;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Picks the base URL from the first path segment and joins the two.
 *
 * The contacts base already ends in `/contacts`, so that segment is consumed
 * rather than repeated: `/contacts` -> the collection root, `/contacts/{id}` ->
 * a single contact.
 */
export function resolveUrl(path: string): string {
  const queryIndex = path.indexOf("?");
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const query = queryIndex === -1 ? "" : path.slice(queryIndex);

  const segments = pathname.split("/").filter(Boolean);
  const root = segments[0]?.toLowerCase();

  if (root && COMMERCE_ROOTS.has(root)) {
    return `${COMMERCE_BASE_URL}/${segments.join("/")}${query}`;
  }

  if (root && CONTACTS_ROOTS.has(root)) {
    const suffix = segments.slice(1).join("/");
    return `${CONTACTS_BASE_URL}${suffix ? `/${suffix}` : ""}${query}`;
  }

  throw new Error(
    `Cannot resolve a Squarespace base URL for path "${path}". ` +
      `Expected it to start with one of: ${[...COMMERCE_ROOTS, ...CONTACTS_ROOTS].join(", ")}.`,
  );
}

/**
 * Issues a request against the Squarespace API and returns the parsed JSON body.
 *
 * @throws {SquarespaceError} on any non-2xx response (after one retry for 429).
 */
export async function squarespaceRequest<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;
  const url = resolveUrl(path);

  const init: RequestInit = {
    method,
    headers: {
      ...buildAuthHeader(process.env.SQUARESPACE_API_KEY),
      "User-Agent": USER_AGENT,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };

  let response = await fetch(url, init);

  if (response.status === 429) {
    await sleep(RATE_LIMIT_COOLDOWN_MS);
    response = await fetch(url, init);
  }

  if (!response.ok) {
    const rawText = await response.text();
    let rawBody: unknown;
    try {
      rawBody = rawText ? JSON.parse(rawText) : undefined;
    } catch {
      rawBody = undefined;
    }
    throw new SquarespaceError(normalizeError(response.status, rawBody));
  }

  // Some write endpoints (e.g. inventory adjustments, per its schema's notes)
  // may answer 204 No Content on success — response.json() throws on an
  // empty body, so read text first and only parse when there's something to
  // parse.
  const rawText = await response.text();
  return (rawText ? JSON.parse(rawText) : undefined) as T;
}
