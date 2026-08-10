import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import {
  getOrAdjustInventory,
  type AdjustInventoryResult,
} from "../src/actions/get-or-adjust-inventory";

const VARIANT_ID = "303079a3-a085-45aa-8814-ce63e140c2b4";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Trimmed from the real 21-record capture in fixtures/inventory.json. */
const inventoryResponse = {
  inventory: [
    {
      variantId: "109e1be8-8aa4-4c61-a0f0-30a4f590f8f2",
      sku: "SQ1157834",
      descriptor: "Terra chunk [6]",
      quantity: 1,
      isUnlimited: false,
    },
    {
      variantId: VARIANT_ID,
      sku: "SQ4985207",
      descriptor: "Test Product — Canvas Tote Bag [Small]",
      quantity: 10,
      isUnlimited: false,
    },
  ],
  pagination: { nextPageUrl: null, nextPageCursor: null, hasNextPage: false },
};

beforeEach(() => {
  mockRequest.mockReset();
  // Safety net: if the client mock ever stops intercepting, fail loudly here
  // rather than silently issuing real requests against the live Squarespace API.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected real network call in tests");
    }),
  );
});

describe("getOrAdjustInventory — read mode (no adjustments provided)", () => {
  it("parses a response shaped like fixtures/inventory.json", async () => {
    mockRequest.mockResolvedValue(inventoryResponse);

    const result = await getOrAdjustInventory();

    expect(result).toEqual({
      inventory: inventoryResponse.inventory,
      pagination: { nextPageCursor: null, nextPageUrl: null, hasNextPage: false },
    });
  });

  it("calls GET /inventory with no extra options — confirms no Idempotency-Key header is sent", async () => {
    mockRequest.mockResolvedValue(inventoryResponse);

    await getOrAdjustInventory();

    expect(mockRequest).toHaveBeenCalledTimes(1);
    // Single-argument call: no options/headers object was passed at all.
    expect(mockRequest.mock.calls[0]).toEqual(["/inventory"]);
  });

  it("passes cursor and limit as query params", async () => {
    mockRequest.mockResolvedValue(inventoryResponse);

    await getOrAdjustInventory({ cursor: "abc123" });
    expect(mockRequest).toHaveBeenCalledWith("/inventory?cursor=abc123");

    await getOrAdjustInventory({ limit: 5 });
    expect(mockRequest).toHaveBeenCalledWith("/inventory?limit=5");
  });

  it("defaults pagination when the response omits it", async () => {
    mockRequest.mockResolvedValue({ inventory: [] });

    const result = await getOrAdjustInventory();

    expect(result).toEqual({
      inventory: [],
      pagination: { nextPageCursor: null, nextPageUrl: null, hasNextPage: false },
    });
  });
});

describe("getOrAdjustInventory — write mode (adjustments provided)", () => {
  it("sends an Idempotency-Key header with the adjustment request", async () => {
    mockRequest.mockResolvedValue({ adjusted: true });

    const result = (await getOrAdjustInventory({
      incrementOperations: [{ variantId: VARIANT_ID, quantity: 1 }],
    })) as AdjustInventoryResult;

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const [path, options] = mockRequest.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(path).toBe("/inventory/adjustments");
    expect(options.headers).toHaveProperty("Idempotency-Key");
    expect(options.headers["Idempotency-Key"]).toMatch(UUID_PATTERN);
    expect(result.idempotencyKey).toBe(options.headers["Idempotency-Key"]);
    expect(result.adjusted).toBe(true);
  });

  it("reuses a supplied idempotency key rather than generating a new one", async () => {
    mockRequest.mockResolvedValue({ adjusted: true });

    const suppliedKey = "d1f2a3b4-5c6d-4e7f-8a9b-0c1d2e3f4a5b";
    const result = (await getOrAdjustInventory({
      idempotencyKey: suppliedKey,
      setFiniteOperations: [{ variantId: VARIANT_ID, quantity: 5 }],
    })) as AdjustInventoryResult;

    expect(mockRequest).toHaveBeenCalledWith(
      "/inventory/adjustments",
      expect.objectContaining({ headers: { "Idempotency-Key": suppliedKey } }),
    );
    expect(result.idempotencyKey).toBe(suppliedKey);
  });

  it("sends the request body under the correct operation array (POST, correct shape)", async () => {
    mockRequest.mockResolvedValue({ adjusted: true });

    await getOrAdjustInventory({
      setUnlimitedOperations: [{ variantId: VARIANT_ID }],
    });

    expect(mockRequest).toHaveBeenCalledWith(
      "/inventory/adjustments",
      expect.objectContaining({
        method: "POST",
        body: { setUnlimitedOperations: [{ variantId: VARIANT_ID }] },
      }),
    );
  });

  it("synthesizes { adjusted: true } when the API answers with an empty body (204)", async () => {
    mockRequest.mockResolvedValue(undefined);

    const result = (await getOrAdjustInventory({
      incrementOperations: [{ variantId: VARIANT_ID, quantity: 1 }],
    })) as AdjustInventoryResult;

    expect(result.adjusted).toBe(true);
  });

  it("rejects a negative incrementOperations quantity locally, without a network call — confirmed live: Squarespace rejects it too", async () => {
    await expect(
      getOrAdjustInventory({
        incrementOperations: [{ variantId: VARIANT_ID, quantity: -1 }],
      }),
    ).rejects.toThrow(/incrementOperations only adds stock/i);

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a zero incrementOperations quantity locally too (minimum is 1, not 0)", async () => {
    await expect(
      getOrAdjustInventory({
        incrementOperations: [{ variantId: VARIANT_ID, quantity: 0 }],
      }),
    ).rejects.toThrow(/incrementOperations only adds stock/i);

    expect(mockRequest).not.toHaveBeenCalled();
  });
});
