import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import { listProducts } from "../src/actions/list-products";
import { testConnection } from "../src/connector";

/** Trimmed to the fields the action reads, but shaped like a real response. */
const productsResponse = {
  products: [
    {
      id: "6813b0c8f4a2b10001f3a9d1",
      type: "PHYSICAL",
      name: "Test Product — Canvas Tote Bag",
      isVisible: true,
      variants: [
        {
          id: "303079a3-a085-45aa-8814-ce63e140c2b4",
          sku: "SQ4985207",
          pricing: { basePrice: { currency: "USD", value: "25.00" } },
        },
      ],
    },
    {
      id: "6813b0c8f4a2b10001f3a9d2",
      type: "PHYSICAL",
      name: "Naranja heel",
      isVisible: true,
      variants: [],
    },
  ],
  pagination: {
    nextPageUrl: "https://api.squarespace.com/1.0/commerce/products?cursor=abc123",
    nextPageCursor: "abc123",
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

describe("listProducts", () => {
  it("returns the products array and pagination from the response", async () => {
    mockRequest.mockResolvedValue(productsResponse);

    const result = await listProducts();

    expect(result.products).toEqual(productsResponse.products);
    expect(result.products).toHaveLength(2);
    expect(result.pagination).toEqual({
      nextPageCursor: "abc123",
      nextPageUrl: "https://api.squarespace.com/1.0/commerce/products?cursor=abc123",
      hasNextPage: true,
    });
    expect(mockRequest).toHaveBeenCalledWith("/products");
  });

  it("passes cursor and limit as query params when provided", async () => {
    mockRequest.mockResolvedValue(productsResponse);

    await listProducts({ limit: 20 });
    expect(mockRequest).toHaveBeenCalledWith("/products?limit=20");

    await listProducts({ cursor: "abc123" });
    expect(mockRequest).toHaveBeenCalledWith("/products?cursor=abc123");
  });

  it("defaults pagination when the last page omits it", async () => {
    mockRequest.mockResolvedValue({
      products: [],
      pagination: { nextPageUrl: null, nextPageCursor: null, hasNextPage: false },
    });

    const result = await listProducts();

    expect(result.products).toEqual([]);
    expect(result.pagination).toEqual({
      nextPageCursor: null,
      nextPageUrl: null,
      hasNextPage: false,
    });
  });
});

describe("testConnection", () => {
  it("returns { success: true } when the probe request succeeds", async () => {
    mockRequest.mockResolvedValue({
      products: [productsResponse.products[0]],
      pagination: { nextPageUrl: null, nextPageCursor: null, hasNextPage: false },
    });

    await expect(testConnection()).resolves.toEqual({ success: true });
    expect(mockRequest).toHaveBeenCalledWith("/products?limit=1");
  });

  it("returns { success: false, error } instead of throwing on failure", async () => {
    const error = new Error("Squarespace request failed with HTTP 401");
    mockRequest.mockRejectedValue(error);

    await expect(testConnection()).resolves.toEqual({ success: false, error });
  });
});
