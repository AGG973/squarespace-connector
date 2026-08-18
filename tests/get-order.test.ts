import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import { getOrder } from "../src/actions/get-order";

const ORDER_ID = "6a81716f0589b404e7529648";

/**
 * The already-confirmed order shape, from fixtures/create-order-response.json
 * (CONFIRMED live, 2026-08-16, via create_order/list_orders — not via this
 * endpoint, which has never itself been called). customerEmail replaced with
 * a placeholder; every other field verbatim.
 */
const orderResponse = {
  id: ORDER_ID,
  orderNumber: "1",
  createdOn: "2026-08-16T08:14:10Z",
  modifiedOn: "2026-08-16T08:14:39.705Z",
  channel: "external",
  testmode: false,
  customerEmail: "buyer@example.com",
  customerId: "6a7afd9c3a715540f23e0a54",
  billingAddress: null,
  shippingAddress: null,
  fulfillmentStatus: "PENDING",
  lineItems: [
    {
      id: "6a81716fc8fe4c0001305355",
      variantId: "303079a3-a085-45aa-8814-ce63e140c2b4",
      sku: "SQ4985207",
      productId: "6a72f2378d7a8a3a29161789",
      productName: "Test Product — Canvas Tote Bag",
      quantity: 1,
      unitPricePaid: { currency: "USD", value: "20.00" },
      lineItemType: "PHYSICAL_PRODUCT",
    },
  ],
  subtotal: { currency: "USD", value: "20.00" },
  grandTotal: { currency: "USD", value: "20.00" },
  channelName: "DOO Connector Test",
  externalOrderReference: "TEST-CONNECTOR-002",
  priceTaxInterpretation: "EXCLUSIVE",
  paymentState: "PAID",
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

describe("getOrder — client-side validation", () => {
  it("rejects a missing id before any request is sent", async () => {
    await expect(getOrder(undefined as never)).rejects.toThrow(/id is required/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects an empty-string id before any request is sent", async () => {
    await expect(getOrder({ id: "" })).rejects.toThrow(/id is required/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe("getOrder — request path", () => {
  it("resolves to /orders/{id}", async () => {
    mockRequest.mockResolvedValue(orderResponse);

    await getOrder({ id: ORDER_ID });

    // squarespaceRequest is mocked here, so this only proves *our* action
    // builds the right path — it does not by itself prove Squarespace's
    // live API actually exposes GET /orders/{id}, or that its real response
    // matches this shape. That's unconfirmed — see the schema's
    // VERIFICATION STATUS and connector.yaml's known_limitations.
    expect(mockRequest).toHaveBeenCalledWith(`/orders/${ORDER_ID}`);
  });

  it("URL-encodes the id in the path", async () => {
    mockRequest.mockResolvedValue(orderResponse);

    await getOrder({ id: "weird id/with slash" });

    expect(mockRequest).toHaveBeenCalledWith("/orders/weird%20id%2Fwith%20slash");
  });
});

describe("getOrder — successful response", () => {
  it("returns the mocked order as-is", async () => {
    mockRequest.mockResolvedValue(orderResponse);

    const result = await getOrder({ id: ORDER_ID });

    expect(result).toEqual(orderResponse);
  });
});
