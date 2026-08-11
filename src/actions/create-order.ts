import { randomUUID } from "node:crypto";
import { squarespaceRequest } from "../client.ts";

export interface Money {
  currency: string;
  value: string;
}

export interface Address {
  firstName?: string;
  lastName?: string;
  address1: string;
  address2?: string | null;
  city: string;
  state?: string;
  countryCode: string;
  postalCode: string;
  phone?: string;
}

export type FulfillmentStatus = "PENDING" | "FULFILLED" | "CANCELED";

/**
 * Matches Squarespace's official CreateLineItemRequest contract exactly,
 * reconciled 2026-08-10 against that authoritative source — not inferred
 * from the response shape. `sku` does not exist on this request shape at
 * all (it's response-only), so unlike CreateOrderInput below there's no
 * lingering-but-forbidden field here; it's simply absent from this type.
 * `title` was corrected 2026-08-11 from unconditionally required to
 * conditionally forbidden — see its own comment below.
 */
export interface CreateOrderLineItemInput {
  /**
   * CONFIRMED, 2026-08-10: "PHYSICAL_PRODUCT" is correct for physical
   * products — this connector's only tested case so far. Other product
   * types (digital goods, services, gift cards, etc.) likely use different
   * values; unconfirmed, and not needed until the connector handles those.
   */
  lineItemType: string;
  variantId: string;
  quantity: number;
  unitPricePaid: Money;
  /**
   * Squarespace's official field name — NOT productName (that's
   * response-only). NOT unconditionally required — its requirement depends
   * on lineItemType: for "PHYSICAL_PRODUCT", CONFIRMED live, 2026-08-11 —
   * must be omitted or null (Squarespace rejects a non-null title with
   * "lineItems.title must be null or omitted", presumably because it's
   * derived from the catalog product via variantId). For any OTHER
   * lineItemType value, title's requirement is UNCONFIRMED — no data yet,
   * do not guess; see assertValidInput below, which only enforces the one
   * confirmed rule.
   */
  title?: string | null;
  /**
   * INFERRED, not confirmed — appears optional based on its descriptive
   * purpose (presumably the item's regular price when unitPricePaid
   * reflects a sale/discounted price). Not explicitly confirmed as
   * optional vs required.
   */
  nonSaleUnitPrice?: Money;
}

export interface ShippingLine {
  method: string;
  amount: Money;
}

export interface DiscountLine {
  name: string;
  amount: Money;
  promoCode?: string;
}

/**
 * Matches Squarespace's official CreateOrderRequest contract, reconciled
 * 2026-08-10 against that authoritative source — supersedes the shape
 * previously inferred from 4 live 400 rejections and from the read-side
 * response shape.
 */
export interface CreateOrderInput {
  /** Reused verbatim if supplied; generated fresh otherwise. Sent as a header, never in the body. */
  idempotencyKey?: string;
  /** REQUIRED. Max length 30. */
  channelName: string;
  /** REQUIRED. ISO 8601 — the caller supplies this order-creation timestamp. */
  createdOn: string;
  /** REQUIRED. Max length 200. */
  externalOrderReference: string;
  /**
   * REQUIRED — must be present, though an empty array is valid and
   * expected for a new order with no fulfillments yet. Item shape
   * UNVERIFIED; not needed for typical order creation, so [] is the safe
   * value to pass.
   */
  fulfillments: unknown[];
  /** REQUIRED. */
  grandTotal: Money;
  /** REQUIRED, non-empty. */
  lineItems: CreateOrderLineItemInput[];
  /** REQUIRED — no default; the caller must choose. */
  priceTaxInterpretation: "EXCLUSIVE" | "INCLUSIVE";
  /** NOT required (previously modelled as required — that was wrong). */
  customerEmail?: string;
  billingAddress?: Address;
  shippingAddress?: Address;
  discountLines?: DiscountLine[];
  discountTotal?: Money;
  /** ISO 8601. Distinct from fulfillments (the array) and fulfillmentStatus (the enum). */
  fulfilledOn?: string;
  fulfillmentStatus?: FulfillmentStatus;
  inventoryBehavior?: "DECREMENT" | "NONE";
  shippingLines?: ShippingLine[];
  shippingTotal?: Money;
  /** CONFIRMED enum, 2026-08-10: controls whether Squarespace emails the customer a fulfillment notification. */
  shopperFulfillmentNotificationBehavior?: "SEND" | "SKIP";
  subtotal?: Money;
  taxTotal?: Money;
}

export interface CreateOrderResult extends Record<string, unknown> {
  /** The Idempotency-Key actually sent — the caller's if supplied, otherwise the generated one. */
  idempotencyKey: string;
}

/**
 * Raw order shape from Squarespace. UNVERIFIED — modelled on
 * fixtures/create-order-response.json, itself a placeholder; no order has
 * ever been created against the live API. Kept as an open record rather
 * than the schema's precise field list so an unexpected real shape still
 * passes through instead of being silently dropped.
 */
type CreateOrderResponse = Record<string, unknown>;

function isMoney(value: unknown): value is Money {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Money).currency === "string" &&
    typeof (value as Money).value === "string"
  );
}

/**
 * Validates the fields src/schemas/create-order.schema.json currently marks
 * required, matching Squarespace's official CreateOrderRequest /
 * CreateLineItemRequest contract (reconciled 2026-08-10): channelName,
 * createdOn, externalOrderReference, fulfillments (array, may be empty),
 * grandTotal, a non-empty lineItems array (each with lineItemType,
 * variantId, quantity, unitPricePaid — no sku), and priceTaxInterpretation.
 * title is NOT unconditionally required: confirmed live, 2026-08-11, that
 * it must be omitted/null when lineItemType is "PHYSICAL_PRODUCT" — only
 * that one rule is enforced below, since title's requirement for any other
 * lineItemType is unconfirmed. This is the highest-risk action
 * (irreversible, rate-limited), so catching bad input locally beats
 * round-tripping to find out from Squarespace's 400.
 */
function assertValidInput(input: Partial<CreateOrderInput> | null | undefined): void {
  if (!input) {
    throw new Error(
      "createOrder: input is required — expected at least channelName, createdOn, " +
        "externalOrderReference, fulfillments, grandTotal, lineItems, and priceTaxInterpretation.",
    );
  }

  const errors: string[] = [];

  if (typeof input.channelName !== "string" || input.channelName.trim() === "") {
    errors.push("channelName is required.");
  }

  if (typeof input.createdOn !== "string" || input.createdOn.trim() === "") {
    errors.push("createdOn is required.");
  }

  if (typeof input.externalOrderReference !== "string" || input.externalOrderReference.trim() === "") {
    errors.push("externalOrderReference is required.");
  }

  if (!Array.isArray(input.fulfillments)) {
    errors.push("fulfillments is required — pass [] if there are none yet.");
  }

  if (!isMoney(input.grandTotal)) {
    errors.push("grandTotal must be a { currency, value } money object.");
  }

  if (!Array.isArray(input.lineItems) || input.lineItems.length === 0) {
    errors.push("lineItems must be a non-empty array.");
  } else {
    input.lineItems.forEach((item, index) => {
      if (typeof item.lineItemType !== "string" || item.lineItemType.trim() === "") {
        errors.push(`lineItems[${index}].lineItemType is required.`);
      }
      if (typeof item.variantId !== "string" || item.variantId.trim() === "") {
        errors.push(`lineItems[${index}].variantId is required.`);
      }
      if (typeof item.quantity !== "number" || item.quantity < 1) {
        errors.push(`lineItems[${index}].quantity must be an integer >= 1.`);
      }
      if (!isMoney(item.unitPricePaid)) {
        errors.push(`lineItems[${index}].unitPricePaid must be a { currency, value } money object.`);
      }
      // title is NOT unconditionally required. Only the PHYSICAL_PRODUCT case
      // is confirmed (2026-08-11): a non-null title gets rejected. For any
      // other lineItemType, title's requirement is unconfirmed — no check
      // applied here, don't guess.
      if (item.lineItemType === "PHYSICAL_PRODUCT" && item.title !== undefined && item.title !== null) {
        errors.push(
          `lineItems[${index}].title must be omitted or null when lineItemType is "PHYSICAL_PRODUCT" ` +
            "(confirmed live, 2026-08-11: Squarespace rejects a non-null title in that case).",
        );
      }
      if ("sku" in item) {
        errors.push(
          `lineItems[${index}].sku does not exist on the create-order request shape (it's ` +
            "response-only) — use variantId instead.",
        );
      }
    });
  }

  if (input.priceTaxInterpretation !== "EXCLUSIVE" && input.priceTaxInterpretation !== "INCLUSIVE") {
    errors.push('priceTaxInterpretation is required and must be exactly "EXCLUSIVE" or "INCLUSIVE".');
  }

  if (errors.length > 0) {
    throw new Error(`createOrder: invalid input — ${errors.join(" ")}`);
  }
}

/** Builds the request body explicitly, field by field — idempotencyKey is a header, never body content. */
function buildRequestBody(input: CreateOrderInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    channelName: input.channelName,
    createdOn: input.createdOn,
    externalOrderReference: input.externalOrderReference,
    fulfillments: input.fulfillments,
    grandTotal: input.grandTotal,
    lineItems: input.lineItems,
    priceTaxInterpretation: input.priceTaxInterpretation,
  };

  if (input.customerEmail !== undefined) body.customerEmail = input.customerEmail;
  if (input.billingAddress !== undefined) body.billingAddress = input.billingAddress;
  if (input.shippingAddress !== undefined) body.shippingAddress = input.shippingAddress;
  if (input.discountLines !== undefined) body.discountLines = input.discountLines;
  if (input.discountTotal !== undefined) body.discountTotal = input.discountTotal;
  if (input.fulfilledOn !== undefined) body.fulfilledOn = input.fulfilledOn;
  if (input.fulfillmentStatus !== undefined) body.fulfillmentStatus = input.fulfillmentStatus;
  if (input.inventoryBehavior !== undefined) body.inventoryBehavior = input.inventoryBehavior;
  if (input.shippingLines !== undefined) body.shippingLines = input.shippingLines;
  if (input.shippingTotal !== undefined) body.shippingTotal = input.shippingTotal;
  if (input.shopperFulfillmentNotificationBehavior !== undefined) {
    body.shopperFulfillmentNotificationBehavior = input.shopperFulfillmentNotificationBehavior;
  }
  if (input.subtotal !== undefined) body.subtotal = input.subtotal;
  if (input.taxTotal !== undefined) body.taxTotal = input.taxTotal;

  return body;
}

/**
 * Creates a new order (squarespace.create_order).
 *
 * The REQUEST shape now matches Squarespace's official documented
 * CreateOrderRequest/CreateLineItemRequest contract, reconciled 2026-08-10
 * directly against that authoritative source — superseding the shape
 * previously inferred from 4 live 400 rejections and from the read-side
 * response shape. One correction since then, from a real submission
 * attempt: lineItems[].title is NOT unconditionally required — confirmed
 * live, 2026-08-11, that it must be omitted/null when lineItemType is
 * "PHYSICAL_PRODUCT"; unconfirmed for any other lineItemType. Two residual
 * uncertainties: lineItems[].nonSaleUnitPrice's optionality is inferred,
 * not explicitly confirmed, and fulfillments' item shape remains
 * unconfirmed ([] is the safe default).
 *
 * END-TO-END SUCCESS IS STILL UNVERIFIED — no order has ever been
 * successfully created through this connector; the output/response shape
 * is unchanged by this reconciliation and still mirrors the placeholder in
 * fixtures/create-order-response.json.
 *
 * Per connector.yaml this action is irreversible, requires approval, and is
 * rate-limited to 100 calls/hour/site — none of which is enforced here;
 * that's a caller/orchestration concern, not this function's.
 */
export async function createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
  assertValidInput(input);

  const idempotencyKey = input.idempotencyKey ?? randomUUID();
  const body = buildRequestBody(input);

  const response = await squarespaceRequest<CreateOrderResponse | undefined>("/orders", {
    method: "POST",
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  });

  return {
    ...(response ?? {}),
    idempotencyKey,
  };
}
