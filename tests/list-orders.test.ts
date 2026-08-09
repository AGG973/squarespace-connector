import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import { listOrders } from "../src/actions/list-orders";

/** Trimmed to the fields the action reads, but shaped like fixtures/orders.json. */
const emptyOrdersResponse = {
  result: [],
  pagination: { nextPageUrl: null, nextPageCursor: null, hasNextPage: false },
};

/** Real key is `result`, not `orders` — this is the thing under test. */
const ordersResponse = {
  result: [
    {
      id: "6813b0c8f4a2b10001f3aa01",
      orderNumber: "1",
      fulfillmentStatus: "PENDING",
      lineItems: [
        {
          id: "6813b0c8f4a2b10001f3aa02",
          sku: "SQ5971216",
          quantity: 2,
        },
      ],
      grandTotal: { currency: "USD", value: "59.44" },
    },
  ],
  pagination: {
    nextPageUrl: "https://api.squarespace.com/1.0/commerce/orders?cursor=xyz789",
    nextPageCursor: "xyz789",
    hasNextPage: true,
  },
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

describe("listOrders", () => {
  it("reads the `result` key (not `orders`) and returns it renamed to `orders`", async () => {
    mockRequest.mockResolvedValue(ordersResponse);

    const result = await listOrders();

    expect(result.orders).toEqual(ordersResponse.result);
    expect(result.pagination).toEqual({
      nextPageCursor: "xyz789",
      nextPageUrl: "https://api.squarespace.com/1.0/commerce/orders?cursor=xyz789",
      hasNextPage: true,
    });
    expect(mockRequest).toHaveBeenCalledWith("/orders");
  });

  it("pages by cursor alone", async () => {
    mockRequest.mockResolvedValue(emptyOrdersResponse);

    await listOrders({ cursor: "abc123" });

    expect(mockRequest).toHaveBeenCalledWith("/orders?cursor=abc123");
  });

  it("passes a modifiedAfter/modifiedBefore window plus fulfillmentStatus as query params", async () => {
    mockRequest.mockResolvedValue(emptyOrdersResponse);

    await listOrders({
      modifiedAfter: "2026-01-01T00:00:00.000Z",
      modifiedBefore: "2026-08-08T00:00:00.000Z",
      fulfillmentStatus: "PENDING",
    });

    const expectedQuery = new URLSearchParams({
      modifiedAfter: "2026-01-01T00:00:00.000Z",
      modifiedBefore: "2026-08-08T00:00:00.000Z",
      fulfillmentStatus: "PENDING",
    }).toString();
    expect(mockRequest).toHaveBeenCalledWith(`/orders?${expectedQuery}`);
  });

  it("rejects cursor combined with a date range before any request is sent", async () => {
    await expect(
      listOrders({ cursor: "abc123", modifiedAfter: "2026-01-01T00:00:00.000Z" }),
    ).rejects.toThrow(/cursor/i);

    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("allows cursor combined with fulfillmentStatus and/or limit (only the date-range window is exclusive with cursor)", async () => {
    mockRequest.mockResolvedValue(emptyOrdersResponse);

    await listOrders({ cursor: "abc123", fulfillmentStatus: "PENDING", limit: 20 });

    const expectedQuery = new URLSearchParams({
      cursor: "abc123",
      limit: "20",
      fulfillmentStatus: "PENDING",
    }).toString();
    expect(mockRequest).toHaveBeenCalledWith(`/orders?${expectedQuery}`);
  });

  it("allows a one-sided date range — modifiedAfter/modifiedBefore are not required to be paired", async () => {
    mockRequest.mockResolvedValue(emptyOrdersResponse);

    await listOrders({ modifiedAfter: "2026-01-01T00:00:00.000Z" });

    expect(mockRequest).toHaveBeenCalledWith(
      `/orders?${new URLSearchParams({ modifiedAfter: "2026-01-01T00:00:00.000Z" }).toString()}`,
    );
  });

  it("defaults pagination when the response omits it", async () => {
    mockRequest.mockResolvedValue({ result: [] });

    const result = await listOrders();

    expect(result.orders).toEqual([]);
    expect(result.pagination).toEqual({
      nextPageCursor: null,
      nextPageUrl: null,
      hasNextPage: false,
    });
  });
});
