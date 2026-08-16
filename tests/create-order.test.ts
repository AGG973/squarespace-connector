import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import { createOrder } from "../src/actions/create-order";

const VARIANT_ID = "303079a3-a085-45aa-8814-ce63e140c2b4";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Matches Squarespace's official CreateLineItemRequest contract, reconciled
 * 2026-08-10. No `title` — confirmed live, 2026-08-11, that a non-null
 * title is rejected when lineItemType is "PHYSICAL_PRODUCT".
 */
const validLineItem = {
  lineItemType: "PHYSICAL_PRODUCT",
  variantId: VARIANT_ID,
  quantity: 1,
  unitPricePaid: { currency: "USD", value: "20.00" },
};

/**
 * Minimal input satisfying every field src/schemas/create-order.schema.json
 * currently requires. subtotal is REQUIRED — confirmed live, 2026-08-16,
 * that Squarespace rejects the request without it (previously modeled as
 * optional).
 */
const validInput = {
  channelName: "doo-connector",
  createdOn: "2026-08-10T00:00:00.000Z",
  externalOrderReference: "DOO-TEST-0001",
  fulfillments: [] as unknown[],
  grandTotal: { currency: "USD", value: "20.00" },
  lineItems: [validLineItem],
  priceTaxInterpretation: "EXCLUSIVE" as const,
  subtotal: { currency: "USD", value: "20.00" },
};

/** Trimmed from fixtures/create-order-response.json — the real captured response from a successful live create_order call, 2026-08-16. */
const orderResponse = {
  id: "00000000-0000-0000-0000-000000000000",
  orderNumber: "1",
  createdOn: "2026-01-01T00:00:00.000Z",
  lineItems: [
    {
      id: "00000000-0000-0000-0000-000000000001",
      variantId: VARIANT_ID,
      sku: "SQ4985207",
      productName: "Test Product — Canvas Tote Bag",
      quantity: 1,
      unitPricePaid: { currency: "USD", value: "20.00" },
    },
  ],
  grandTotal: { currency: "USD", value: "20.00" },
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

describe("createOrder — Idempotency-Key handling (same pattern as get-or-adjust-inventory)", () => {
  it("sends an Idempotency-Key header with the order request", async () => {
    mockRequest.mockResolvedValue(orderResponse);

    const result = await createOrder(validInput);

    expect(mockRequest).toHaveBeenCalledTimes(1);
    const [path, options] = mockRequest.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: Record<string, unknown> },
    ];
    expect(path).toBe("/orders");
    expect(options.method).toBe("POST");
    expect(options.headers).toHaveProperty("Idempotency-Key");
    expect(options.headers["Idempotency-Key"]).toMatch(UUID_PATTERN);
    expect(result.idempotencyKey).toBe(options.headers["Idempotency-Key"]);
  });

  it("reuses a supplied idempotency key rather than generating a new one", async () => {
    mockRequest.mockResolvedValue(orderResponse);

    const suppliedKey = "9f8e7d6c-5b4a-4321-9876-543210fedcba";
    const result = await createOrder({ ...validInput, idempotencyKey: suppliedKey });

    expect(mockRequest).toHaveBeenCalledWith(
      "/orders",
      expect.objectContaining({ headers: { "Idempotency-Key": suppliedKey } }),
    );
    expect(result.idempotencyKey).toBe(suppliedKey);
  });

  it("never forwards idempotencyKey in the request body — header only", async () => {
    mockRequest.mockResolvedValue(orderResponse);

    await createOrder({ ...validInput, idempotencyKey: "9f8e7d6c-5b4a-4321-9876-543210fedcba" });

    const [, options] = mockRequest.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(options.body).not.toHaveProperty("idempotencyKey");
  });
});

describe("createOrder — client-side validation matches Squarespace's official contract (2026-08-10, title rule 2026-08-11, subtotal rule 2026-08-16)", () => {
  it("rejects entirely missing input", async () => {
    await expect(createOrder(undefined as never)).rejects.toThrow(/input is required/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing channelName", async () => {
    const { channelName: _omit, ...rest } = validInput;
    await expect(createOrder(rest as never)).rejects.toThrow(/channelName/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing createdOn", async () => {
    const { createdOn: _omit, ...rest } = validInput;
    await expect(createOrder(rest as never)).rejects.toThrow(/createdOn/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing externalOrderReference", async () => {
    const { externalOrderReference: _omit, ...rest } = validInput;
    await expect(createOrder(rest as never)).rejects.toThrow(/externalOrderReference/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing fulfillments array (but accepts an empty one)", async () => {
    const { fulfillments: _omit, ...rest } = validInput;
    await expect(createOrder(rest as never)).rejects.toThrow(/fulfillments/i);
    expect(mockRequest).not.toHaveBeenCalled();

    mockRequest.mockResolvedValue(orderResponse);
    await expect(createOrder({ ...validInput, fulfillments: [] })).resolves.toBeDefined();
  });

  it("rejects a missing grandTotal", async () => {
    const { grandTotal: _omit, ...rest } = validInput;
    await expect(createOrder(rest as never)).rejects.toThrow(/grandTotal/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing subtotal (confirmed live, 2026-08-16 — previously modeled as optional)", async () => {
    const { subtotal: _omit, ...rest } = validInput;
    await expect(createOrder(rest as never)).rejects.toThrow(/subtotal/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects an empty lineItems array", async () => {
    await expect(createOrder({ ...validInput, lineItems: [] })).rejects.toThrow(/lineItems/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a missing priceTaxInterpretation, and any value other than EXCLUSIVE/INCLUSIVE", async () => {
    const { priceTaxInterpretation: _omit, ...rest } = validInput;
    await expect(createOrder(rest as never)).rejects.toThrow(/priceTaxInterpretation/i);
    await expect(
      createOrder({ ...validInput, priceTaxInterpretation: "SOMETHING_ELSE" as never }),
    ).rejects.toThrow(/priceTaxInterpretation/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("does NOT require customerEmail (previously incorrectly required)", async () => {
    mockRequest.mockResolvedValue(orderResponse);
    await expect(createOrder(validInput)).resolves.toBeDefined();
    expect(mockRequest).toHaveBeenCalled();
  });

  it("rejects a line item missing lineItemType", async () => {
    const { lineItemType: _omit, ...rest } = validLineItem;
    await expect(
      createOrder({ ...validInput, lineItems: [rest as never] }),
    ).rejects.toThrow(/lineItemType/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a line item missing variantId", async () => {
    const { variantId: _omit, ...rest } = validLineItem;
    await expect(
      createOrder({ ...validInput, lineItems: [rest as never] }),
    ).rejects.toThrow(/variantId/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a line item with quantity < 1", async () => {
    await expect(
      createOrder({ ...validInput, lineItems: [{ ...validLineItem, quantity: 0 }] }),
    ).rejects.toThrow(/quantity/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a line item missing unitPricePaid", async () => {
    const { unitPricePaid: _omit, ...rest } = validLineItem;
    await expect(
      createOrder({ ...validInput, lineItems: [rest as never] }),
    ).rejects.toThrow(/unitPricePaid/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("allows a PHYSICAL_PRODUCT line item with no title at all (title is NOT required)", async () => {
    mockRequest.mockResolvedValue(orderResponse);
    await expect(createOrder(validInput)).resolves.toBeDefined();
    expect(mockRequest).toHaveBeenCalled();
  });

  it("allows a PHYSICAL_PRODUCT line item with title explicitly null", async () => {
    mockRequest.mockResolvedValue(orderResponse);
    await expect(
      createOrder({ ...validInput, lineItems: [{ ...validLineItem, title: null }] }),
    ).resolves.toBeDefined();
    expect(mockRequest).toHaveBeenCalled();
  });

  it("rejects a PHYSICAL_PRODUCT line item with a non-null title (confirmed live, 2026-08-11)", async () => {
    await expect(
      createOrder({
        ...validInput,
        lineItems: [{ ...validLineItem, title: "Test Product — Canvas Tote Bag" }],
      }),
    ).rejects.toThrow(/title/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects a line item that includes sku — it does not exist on the request shape", async () => {
    await expect(
      createOrder({
        ...validInput,
        lineItems: [{ ...validLineItem, sku: "SQ4985207" } as never],
      }),
    ).rejects.toThrow(/sku/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe("createOrder — successful response", () => {
  it("returns the mocked order response merged with the idempotencyKey used", async () => {
    mockRequest.mockResolvedValue(orderResponse);

    const result = await createOrder(validInput);

    expect(result).toMatchObject(orderResponse);
    expect(result.idempotencyKey).toMatch(UUID_PATTERN);
  });

  it("sends the full request body built from the input, without idempotencyKey", async () => {
    mockRequest.mockResolvedValue(orderResponse);

    await createOrder(validInput);

    expect(mockRequest).toHaveBeenCalledWith(
      "/orders",
      expect.objectContaining({
        body: {
          channelName: validInput.channelName,
          createdOn: validInput.createdOn,
          externalOrderReference: validInput.externalOrderReference,
          fulfillments: validInput.fulfillments,
          grandTotal: validInput.grandTotal,
          lineItems: validInput.lineItems,
          priceTaxInterpretation: validInput.priceTaxInterpretation,
          subtotal: validInput.subtotal,
        },
      }),
    );
  });

  it("includes optional fields (e.g. customerEmail) in the body only when supplied", async () => {
    mockRequest.mockResolvedValue(orderResponse);

    await createOrder({ ...validInput, customerEmail: "buyer@example.com" });

    const [, options] = mockRequest.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(options.body.customerEmail).toBe("buyer@example.com");
  });
});
