/**
 * MCP adapter for the Squarespace connector — stdio transport, for local
 * testing (HTTP deployment is separate, later work).
 *
 * Thin by design: no business logic and no direct client.ts/Squarespace
 * calls here — tools/call only ever routes to src/connector.ts.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import { execute, testConnection } from "../src/connector.ts";

const SCHEMAS_DIR = fileURLToPath(new URL("../src/schemas/", import.meta.url));

/**
 * Pulls the `input` sub-schema out of one of src/schemas/*.schema.json and
 * folds in the document's `$defs` so any internal `$ref`s (e.g.
 * list-orders' fulfillmentStatus enum) still resolve once lifted out of
 * their parent document.
 */
function loadInputSchema(fileName: string): Tool["inputSchema"] {
  const schema = JSON.parse(readFileSync(`${SCHEMAS_DIR}${fileName}`, "utf8")) as {
    properties?: { input?: Record<string, unknown> };
    $defs?: Record<string, unknown>;
  };

  const inputSchema = schema.properties?.input;
  if (!inputSchema) {
    throw new Error(`${fileName}: expected a properties.input schema, found none.`);
  }

  const withDefs = schema.$defs ? { ...inputSchema, $defs: schema.$defs } : inputSchema;

  // MCP's Tool.inputSchema requires a literal `type: "object"`. Most of our
  // schemas declare it directly on `input`, but get-or-adjust-inventory's is
  // a bare `oneOf` of two object shapes (discriminated read/write modes) —
  // inject it here rather than changing the schema file's semantics.
  return ("type" in withDefs ? withDefs : { type: "object", ...withDefs }) as Tool["inputSchema"];
}

const TOOLS: Tool[] = [
  {
    name: "testConnection",
    description: "Verify that the configured Squarespace API key can reach the API.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "squarespace.list_products",
    description: "List products in the store catalog.",
    inputSchema: loadInputSchema("list-products.schema.json"),
  },
  {
    name: "squarespace.list_orders",
    description: "List orders, filterable by modification time window or fulfillment status.",
    inputSchema: loadInputSchema("list-orders.schema.json"),
  },
  {
    name: "squarespace.get_or_adjust_inventory",
    description:
      "Read current inventory levels, or submit a stock adjustment. Mode is inferred from " +
      "input: pass incrementOperations/setFiniteOperations/setUnlimitedOperations to adjust " +
      "(write, requires Idempotency-Key — auto-generated if idempotencyKey is omitted), " +
      "otherwise this reads. The adjust path is CONFIRMED live, 2026-08-16 (increment/" +
      "setFinite round trip verified against a real variant).",
    inputSchema: loadInputSchema("get-or-adjust-inventory.schema.json"),
  },
  {
    name: "squarespace.create_order",
    description:
      "Create a new order. Request shape matches Squarespace's official documented contract " +
      "(reconciled 2026-08-10). END-TO-END SUCCESS IS CONFIRMED live, 2026-08-16, via a real " +
      "order created with a personal Developer API Key. Irreversible and rate-limited to 100 " +
      "calls/hour/site per connector.yaml. Requires channelName, createdOn, " +
      "externalOrderReference, fulfillments (pass [] if none), grandTotal, subtotal (must " +
      "equal the sum of lineItems[].unitPricePaid.value — confirmed live, 2026-08-16, to be " +
      "functionally required despite being modeled as optional), priceTaxInterpretation " +
      "(\"EXCLUSIVE\" or \"INCLUSIVE\"), and lineItems (each with lineItemType — " +
      "\"PHYSICAL_PRODUCT\" for physical products — variantId, quantity, and unitPricePaid; " +
      "no sku, and no title either when lineItemType is PHYSICAL_PRODUCT — confirmed live, " +
      "2026-08-11, that a non-null title is rejected in that case). customerEmail is " +
      "optional. Idempotency-Key is auto-generated if idempotencyKey is omitted.",
    inputSchema: loadInputSchema("create-order.schema.json"),
  },
  {
    name: "squarespace.get_contact",
    description:
      "Retrieve a single contact by id. URL resolution, auth, and response SHAPE all " +
      "CONFIRMED live, 2026-08-11 (resolves to /v1/contacts/{id} without doubling the " +
      "segment; verified against one real contact). Response is wrapped in a top-level " +
      "`contact` key, with primaryEmail.{email, acceptsMarketing} rather than a flat email " +
      "field. Requires id.",
    inputSchema: loadInputSchema("get-contact.schema.json"),
  },
];

/** Pulls `{ code, message, ... }`-shaped details out of any thrown value for error content. */
function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const details: Record<string, unknown> = { message: error.message };
    for (const key of ["code", "httpStatus", "requestId", "retryable"]) {
      if (key in error) {
        details[key] = (error as unknown as Record<string, unknown>)[key];
      }
    }
    return details;
  }
  return { message: String(error) };
}

function textResult(value: unknown, isError = false): CallToolResult {
  return {
    isError,
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

async function callTool(
  name: string,
  args: Record<string, unknown> | undefined,
): Promise<CallToolResult> {
  if (name === "testConnection") {
    const result = await testConnection();
    return result.success ? textResult(result) : textResult(describeError(result.error), true);
  }

  if (
    name === "squarespace.list_products" ||
    name === "squarespace.list_orders" ||
    name === "squarespace.get_or_adjust_inventory" ||
    name === "squarespace.create_order" ||
    name === "squarespace.get_contact"
  ) {
    const output = await execute({ actionId: name, input: args });
    return textResult(output);
  }

  throw new Error(`Unknown tool: "${name}"`);
}

/** Exported so tests can drive it over an in-memory transport instead of real stdio. */
export const server = new Server(
  { name: "squarespace-connector", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // One bad call must not kill the session — every path through
  // connector.execute()/testConnection() is caught and returned as
  // isError content rather than left to propagate.
  try {
    return await callTool(request.params.name, request.params.arguments);
  } catch (error) {
    return textResult(describeError(error), true);
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Only auto-connect over real stdio when this file is run directly (e.g.
 * `npm run mcp`), not when it's imported — tests import `server` and drive
 * it over an in-memory transport instead.
 *
 * Lower-cased comparison: on Windows, `import.meta.url` and the URL built
 * from `process.argv[1]` can differ only in drive-letter case (`c:` vs
 * `C:`), same gotcha vitest.config.mts works around.
 */
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url.toLowerCase() === pathToFileURL(process.argv[1]).href.toLowerCase();

if (isEntryPoint) {
  main();
}
