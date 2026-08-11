import { squarespaceRequest } from "./client.ts";
import { listProducts, type ListProductsInput } from "./actions/list-products.ts";
import { listOrders, type ListOrdersInput } from "./actions/list-orders.ts";
import {
  getOrAdjustInventory,
  type GetOrAdjustInventoryInput,
} from "./actions/get-or-adjust-inventory.ts";
import { createOrder, type CreateOrderInput } from "./actions/create-order.ts";
import { getContact, type GetContactInput } from "./actions/get-contact.ts";

export type TestConnectionResult =
  | { success: true }
  | { success: false; error: unknown };

/**
 * Verifies that the configured API key can reach the Squarespace API.
 *
 * Squarespace documents no dedicated "site info" endpoint, so this uses the
 * cheapest confirmed-working read: a single product.
 *
 * Never throws — connection failures are returned, not raised.
 */
export async function testConnection(): Promise<TestConnectionResult> {
  try {
    await squarespaceRequest("/products?limit=1");
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

/** The 5 action IDs declared in connector.yaml. */
export const ACTION_IDS = [
  "squarespace.list_products",
  "squarespace.get_or_adjust_inventory",
  "squarespace.list_orders",
  "squarespace.create_order",
  "squarespace.get_contact",
] as const;

export type ActionId = (typeof ACTION_IDS)[number];

/** Action IDs wired into execute() below. */
const IMPLEMENTED_ACTION_IDS: ReadonlySet<ActionId> = new Set([
  "squarespace.list_products",
  "squarespace.list_orders",
  "squarespace.get_or_adjust_inventory",
  "squarespace.create_order",
  "squarespace.get_contact",
]);

export interface ActionListing {
  actionId: ActionId;
  implemented: boolean;
}

/** Lists all 5 connector.yaml actions, flagging which are implemented so far. */
export function listActions(): ActionListing[] {
  return ACTION_IDS.map((actionId) => ({
    actionId,
    implemented: IMPLEMENTED_ACTION_IDS.has(actionId),
  }));
}

/** Thrown by execute() for a valid-but-unimplemented, or entirely unknown, actionId. */
export class ConnectorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
  }
}

export interface ExecuteRequest {
  actionId: string;
  input?: unknown;
}

/**
 * Routes a { actionId, input } request to the matching action (the
 * DooConnector `execute` entry point).
 *
 * @throws {ConnectorError} code "UNKNOWN_ACTION" for an actionId
 * connector.yaml doesn't declare at all. All 5 declared actions are now
 * wired up — none currently throw "NOT_IMPLEMENTED".
 */
export async function execute({ actionId, input }: ExecuteRequest): Promise<unknown> {
  switch (actionId as ActionId) {
    case "squarespace.list_products":
      return listProducts(input as ListProductsInput | undefined);
    case "squarespace.list_orders":
      return listOrders(input as ListOrdersInput | undefined);
    case "squarespace.get_or_adjust_inventory":
      return getOrAdjustInventory(input as GetOrAdjustInventoryInput | undefined);
    case "squarespace.create_order":
      return createOrder(input as CreateOrderInput);
    case "squarespace.get_contact":
      return getContact(input as GetContactInput);
    default:
      throw new ConnectorError("UNKNOWN_ACTION", `Unknown actionId: "${actionId}"`);
  }
}
