import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import { getProduct } from "../src/actions/get-product";

const PRODUCT_ID = "6a72f2378d7a8a3a29161789";

/**
 * The already-confirmed product shape, from fixtures/products.json
 * (CONFIRMED live via list_products — not via this endpoint, which has
 * never itself been called).
 */
const productResponse = {
  id: PRODUCT_ID,
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
    // builds the right path — it does not by itself prove Squarespace's
    // live API actually exposes GET /products/{id}, or that its real
    // response matches this shape. That's unconfirmed — see the schema's
    // VERIFICATION STATUS and connector.yaml's known_limitations.
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
