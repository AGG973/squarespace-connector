import { squarespaceRequest } from "./client.ts";
import { listProducts, type ListProductsInput } from "./actions/list-products.ts";
import { listOrders, type ListOrdersInput } from "./actions/list-orders.ts";

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

/** Action IDs wired into execute() below — Day 4 scope is 2 of the 5. */
const IMPLEMENTED_ACTION_IDS: ReadonlySet<ActionId> = new Set([
  "squarespace.list_products",
  "squarespace.list_orders",
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
 * @throws {ConnectorError} code "NOT_IMPLEMENTED" for one of connector.yaml's
 * 5 actions that isn't wired up yet (get_or_adjust_inventory, create_order,
 * get_contact — landing Week 2), or "UNKNOWN_ACTION" for an actionId
 * connector.yaml doesn't declare at all.
 */
export async function execute({ actionId, input }: ExecuteRequest): Promise<unknown> {
  switch (actionId as ActionId) {
    case "squarespace.list_products":
      return listProducts(input as ListProductsInput | undefined);
    case "squarespace.list_orders":
      return listOrders(input as ListOrdersInput | undefined);
    case "squarespace.get_or_adjust_inventory":
    case "squarespace.create_order":
    case "squarespace.get_contact":
      throw new ConnectorError("NOT_IMPLEMENTED", `${actionId} is not yet implemented`);
    default:
      throw new ConnectorError("UNKNOWN_ACTION", `Unknown actionId: "${actionId}"`);
  }
}
