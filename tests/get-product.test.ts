import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import { getProduct } from "../src/actions/get-product";

const PRODUCT_ID = "6a82c75d452f993158f1ae4b";

/**
 * The real response shape, from fixtures/product-by-id.json — CONFIRMED
 * live, 2026-08-19, via this endpoint itself. Wrapped in the same
 * top-level `products` array key list_products uses, holding a
 * single-item array, with no `pagination` key — disproving the earlier
 * flat-response assumption (see connector.yaml's known_limitations).
 */
const productResponse = {
  products: [
    {
      id: PRODUCT_ID,
      type: "PHYSICAL",
      storePageId: "6a82c4265d10fd30e43b2d43",
      name: "Test Product — Canvas Tote Bag",
      description: "",
      url: "https://soybean-apricot-tett.squarespace.com/shop/p/test-product-canvas-tote-bag",
      urlSlug: "p/test-product-canvas-tote-bag",
      images: [
        {
          id: "6a82c7ba762f55650d9c1eef",
          altText: "tote bag.jpg",
          orderIndex: 0,
          url: "https://images.squarespace-cdn.com/content/v1/6a82c4255d10fd30e43b2d0d/4912c5a2-bc61-4fa1-934c-dc90eade70a6/tote+bag.jpg",
          originalSize: { width: 1200, height: 1600 },
          availableFormats: [],
        },
      ],
      tags: [],
      isVisible: true,
      variantAttributes: ["Color"],
      variants: [
        {
          id: "70c579d9-d597-41d7-9315-ba4beb0a9619",
          sku: "SQ8906515",
          pricing: {
            basePrice: { currency: "USD", value: "20.00" },
            salePrice: { currency: "USD", value: "0.00" },
            onSale: false,
          },
          stock: { quantity: 3, unlimited: false },
          attributes: { Color: "Navy" },
          shippingMeasurements: {
            weight: { unit: "POUND", value: 30 },
            dimensions: { unit: "INCH", length: 20, width: 10, height: 100 },
          },
          image: null,
        },
      ],
      seoOptions: null,
      createdOn: "2026-08-17T08:33:33.285Z",
      modifiedOn: "2026-08-17T08:36:02.620Z",
      pricing: null,
      digitalGood: null,
    },
  ],
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

describe("getProduct — client-side validation", () => {
  it("rejects a missing id before any request is sent", async () => {
    await expect(getProduct(undefined as never)).rejects.toThrow(/id is required/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects an empty-string id before any request is sent", async () => {
    await expect(getProduct({ id: "" })).rejects.toThrow(/id is required/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe("getProduct — request path", () => {
  it("resolves to /products/{id}", async () => {
    mockRequest.mockResolvedValue(productResponse);

    await getProduct({ id: PRODUCT_ID });

    // squarespaceRequest is mocked here, so this only proves *our* action
    // builds the right path. The path itself, and this response shape, ARE
    // now confirmed live (2026-08-19) — see the schema's VERIFICATION
    // STATUS and connector.yaml's known_limitations.
    expect(mockRequest).toHaveBeenCalledWith(`/products/${PRODUCT_ID}`);
  });

  it("URL-encodes the id in the path", async () => {
    mockRequest.mockResolvedValue(productResponse);

    await getProduct({ id: "weird id/with slash" });

    expect(mockRequest).toHaveBeenCalledWith("/products/weird%20id%2Fwith%20slash");
  });
});

describe("getProduct — successful response", () => {
  it("returns the mocked product as-is", async () => {
    mockRequest.mockResolvedValue(productResponse);

    const result = await getProduct({ id: PRODUCT_ID });

    expect(result).toEqual(productResponse);
  });
});
