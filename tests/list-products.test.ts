import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import { listProducts } from "../src/actions/list-products";
import { testConnection } from "../src/connector";

/**
 * Two products trimmed from the real GET /products capture in
 * fixtures/products.json — fewer products/variants than the live response,
 * but every field and value shape here is real, not modelled.
 */
const productsResponse = {
  products: [
    {
      id: "6a72f2378d7a8a3a29161789",
      type: "PHYSICAL",
      storePageId: "6a72f2207b60d851f2d2f110",
      name: "Test Product — Canvas Tote Bag",
      description:
        '<p style="white-space:pre-wrap;" data-rte-preserve-empty="true">Sample product created for Squarespace connector testing.</p>',
      url: "https://jaguar-mandolin-z8g5.squarespace.com/shop/p/test-product-canvas-tote-bag",
      urlSlug: "p/test-product-canvas-tote-bag",
      images: [
        {
          id: "6a72f40a98f72327f79ad890",
          altText: "tote bag.jpg",
          orderIndex: 0,
          url: "https://images.squarespace-cdn.com/content/v1/6a72f2207b60d851f2d2f0f0/b80ab8e5-dfd9-4329-b18d-aa853d6c982a/tote+bag.jpg",
          originalSize: { width: 1200, height: 1600 },
          availableFormats: [],
        },
      ],
      tags: [],
      isVisible: false,
      variantAttributes: ["Size"],
      variants: [
        {
          id: "303079a3-a085-45aa-8814-ce63e140c2b4",
          sku: "SQ4985207",
          pricing: {
            basePrice: { currency: "USD", value: "20.00" },
            salePrice: { currency: "USD", value: "0.00" },
            onSale: false,
          },
          stock: { quantity: 10, unlimited: false },
          attributes: { Size: "Small" },
          shippingMeasurements: {
            weight: { unit: "POUND", value: 0 },
            dimensions: { unit: "INCH", length: 0, width: 0, height: 0 },
          },
          image: null,
        },
      ],
      seoOptions: null,
      createdOn: "2026-08-05T08:20:07.834Z",
      modifiedOn: "2026-08-05T08:27:55.973Z",
      pricing: null,
      digitalGood: null,
    },
    {
      id: "6a72f2207b60d851f2d2f11e",
      type: "PHYSICAL",
      storePageId: "6a72f2207b60d851f2d2f110",
      name: "Naranja heel",
      description:
        "<p>Handcrafted and made to last, this pair of shoes features a versatile design and supportive heel. Made from vegan leather.</p>",
      url: "https://jaguar-mandolin-z8g5.squarespace.com/shop/p/naranja-heel-tadmg",
      urlSlug: "p/naranja-heel-tadmg",
      images: [
        {
          id: "6a72f2207b60d851f2d2f120",
          altText: "",
          orderIndex: 0,
          url: "https://static1.squarespace.com/static/6a72f2207b60d851f2d2f0f0/6a72f2207b60d851f2d2f110/6a72f2207b60d851f2d2f120/1654587159639/Stocksy_comp_2304353-REDUCED.jpg",
          originalSize: { width: 922, height: 1382 },
          availableFormats: ["100w", "300w", "500w", "750w"],
        },
      ],
      tags: ["Collection No.2"],
      isVisible: true,
      variantAttributes: ["Size"],
      variants: [
        {
          id: "1e47ba2d-c337-484e-9abb-f2d166923fe3",
          sku: "SQ1103645",
          pricing: {
            basePrice: { currency: "USD", value: "165.00" },
            salePrice: { currency: "USD", value: "0.00" },
            onSale: false,
          },
          stock: { quantity: 1, unlimited: false },
          attributes: { Size: "6" },
          shippingMeasurements: {
            weight: { unit: "POUND", value: 0 },
            dimensions: { unit: "INCH", length: 0, width: 0, height: 0 },
          },
          image: null,
        },
      ],
      seoOptions: { title: "", description: "" },
      createdOn: "2020-11-12T18:04:32.710Z",
      modifiedOn: "2026-06-30T18:06:38.793Z",
      pricing: null,
      digitalGood: null,
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
