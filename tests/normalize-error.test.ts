import { describe, expect, it } from "vitest";

import { normalizeError } from "../src/errors/normalize";

describe("normalizeError", () => {
  it("maps a 400 with a realistic Squarespace error body to a non-retryable error", () => {
    const raw = {
      type: "InvalidArgument",
      subtype: "ValidationError",
      message: "The request could not be validated.",
      contextId: "8f14e45f-ceea-467e-bd3b-6a5e2f5b1e3d",
    };

    expect(normalizeError(400, raw)).toEqual({
      code: "InvalidArgument.ValidationError",
      message: "The request could not be validated.",
      httpStatus: 400,
      requestId: "8f14e45f-ceea-467e-bd3b-6a5e2f5b1e3d",
      retryable: false,
    });
  });

  it("marks a 429 as retryable", () => {
    const raw = {
      type: "RateLimited",
      subtype: "TooManyRequests",
      message: "Rate limit exceeded.",
      contextId: "rl-context-123",
    };

    const result = normalizeError(429, raw);

    expect(result.code).toBe("RateLimited.TooManyRequests");
    expect(result.retryable).toBe(true);
  });

  it("marks a 500 as retryable", () => {
    const raw = {
      type: "InternalError",
      subtype: "Unexpected",
      message: "An unexpected error occurred.",
      contextId: "srv-context-456",
    };

    const result = normalizeError(500, raw);

    expect(result.code).toBe("InternalError.Unexpected");
    expect(result.retryable).toBe(true);
  });

  it("generates a fallback requestId instead of leaving it empty when contextId is absent", () => {
    const raw = {
      type: "InvalidArgument",
      subtype: "ValidationError",
      message: "The request could not be validated.",
      // no contextId
    };

    const result = normalizeError(400, raw);

    expect(result.requestId).toBeTruthy();
    expect(typeof result.requestId).toBe("string");
    // Generated UUID, not the caller-supplied fallback (none was given here).
    expect(result.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("prefers a caller-supplied fallbackRequestId over generating one when contextId is absent", () => {
    const raw = {
      type: "InvalidArgument",
      subtype: "ValidationError",
      message: "The request could not be validated.",
    };

    const result = normalizeError(400, raw, "fallback-id-789");

    expect(result.requestId).toBe("fallback-id-789");
  });
});
