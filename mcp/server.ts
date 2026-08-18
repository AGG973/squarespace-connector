/**
 * MCP adapter for the Squarespace connector. Supports two transports:
 *
 * - stdio, for local Claude Code usage via .mcp.json (`npm run mcp`).
 * - Streamable HTTP, for remote/hosted deployment (`npm start`), guarded by
 *   a bearer token separate from the Squarespace API key — see
 *   isAuthorized().
 *
 * Mode is chosen automatically at startup based on `process.env.PORT`: set
 * → HTTP; unset → stdio. See main() at the bottom.
 *
 * Thin by design: no business logic and no direct client.ts/Squarespace
 * calls here — tools/call only ever routes to src/connector.ts.
 */

import { createServer as createNodeHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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
 *
 * Also folds in the schema document's top-level `description` — the
 * endpoint-wide contract/verification-status prose (confirmed/unconfirmed
 * findings, request-shape notes, etc.), a different and usually much larger
 * field than `properties.input.description` (which is narrower, just about
 * the input fields). Checked across all 5 schema files, not just
 * create-order's: every one has substantial top-level description content
 * (721-2374 characters) that was previously silently invisible via MCP,
 * since only `properties.input.description` ever made it into the tool
 * schema returned here. MCP's Tool.inputSchema only has room for one
 * description string, so the two are combined rather than dropping either.
 */
function loadInputSchema(fileName: string): Tool["inputSchema"] {
  const schema = JSON.parse(readFileSync(`${SCHEMAS_DIR}${fileName}`, "utf8")) as {
    description?: string;
    properties?: { input?: Record<string, unknown> & { description?: string } };
    $defs?: Record<string, unknown>;
  };

  const inputSchema = schema.properties?.input;
  if (!inputSchema) {
    throw new Error(`${fileName}: expected a properties.input schema, found none.`);
  }

  const topLevelDescription = schema.description;
  const inputDescription = inputSchema.description;
  const combinedDescription =
    topLevelDescription && inputDescription
      ? `${topLevelDescription}\n\nINPUT NOTES: ${inputDescription}`
      : (topLevelDescription ?? inputDescription);

  const withDescription = combinedDescription
    ? { ...inputSchema, description: combinedDescription }
    : inputSchema;

  const withDefs = schema.$defs ? { ...withDescription, $defs: schema.$defs } : withDescription;

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
  {
    name: "squarespace.list_contacts",
    description:
      "List contacts. A 6th action, added beyond connector.yaml's original 5. The response " +
      "envelope (`contacts` array + pagination) and per-contact shape are CONFIRMED, reused " +
      "from get_contact's live testing. This endpoint's own cursor behavior has NOT itself " +
      "been tested live — don't assume it matches list_products' or list_orders' confirmed " +
      "cursor rules.",
    inputSchema: loadInputSchema("list-contacts.schema.json"),
  },
  {
    name: "squarespace.get_order",
    description:
      "Retrieve a single order by id. GET /orders/{id} on the commerce base. The order OBJECT " +
      "SHAPE is CONFIRMED, reused from create_order's and list_orders' live testing. This " +
      "endpoint's own GET-by-id request/response pattern has NOT itself been tested live — " +
      "whether it exists, and whether its response is wrapped in a key (like get_contact's " +
      "turned out to be) or flat (as modeled here, by analogy to create_order), is unconfirmed.",
    inputSchema: loadInputSchema("get-order.schema.json"),
  },
  {
    name: "squarespace.get_product",
    description:
      "Retrieve a single product by id. GET /products/{id} on the commerce base. The product " +
      "OBJECT SHAPE is CONFIRMED, reused from list_products' live testing. This endpoint's own " +
      "GET-by-id request/response pattern has NOT itself been tested live — whether it exists, " +
      "and whether its response is wrapped in a key (like get_contact's turned out to be) or " +
      "flat (as modeled here, by analogy to create_order), is unconfirmed.",
    inputSchema: loadInputSchema("get-product.schema.json"),
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
    name === "squarespace.get_contact" ||
    name === "squarespace.list_contacts" ||
    name === "squarespace.get_order" ||
    name === "squarespace.get_product"
  ) {
    const output = await execute({ actionId: name, input: args });
    return textResult(output);
  }

  throw new Error(`Unknown tool: "${name}"`);
}

/**
 * Builds a fresh MCP Server wired with the same tools/list and tools/call
 * handlers every time. Used once at module scope for the stdio transport
 * (and by tests), and once per request for stateless HTTP — see
 * handleHttpRequest below, which follows the MCP SDK's documented stateless
 * pattern of a fresh Server + Transport pair per request rather than sharing
 * one Server across concurrent HTTP requests.
 */
function createMcpServer(): Server {
  const mcpServer = new Server(
    { name: "squarespace-connector", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    // One bad call must not kill the session — every path through
    // connector.execute()/testConnection() is caught and returned as
    // isError content rather than left to propagate.
    try {
      return await callTool(request.params.name, request.params.arguments);
    } catch (error) {
      return textResult(describeError(error), true);
    }
  });

  return mcpServer;
}

/** Exported so tests can drive it over an in-memory transport instead of real stdio. */
export const server = createMcpServer();

/**
 * Checks the HTTP endpoint's own access token — separate from
 * SQUARESPACE_API_KEY, which authenticates this server to Squarespace, not
 * callers to this server. Expects `Authorization: Bearer <MCP_AUTH_TOKEN>`.
 * Fails closed: an unset MCP_AUTH_TOKEN rejects every request rather than
 * leaving the endpoint open.
 */
function isAuthorized(req: IncomingMessage): boolean {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected) return false;

  const header = req.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  if (!value?.startsWith("Bearer ")) return false;

  return value.slice("Bearer ".length).trim() === expected;
}

function sendJson(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  res.writeHead(status, { "Content-Type": "application/json", ...extraHeaders }).end(JSON.stringify(body));
}

/**
 * Handles one HTTP request for the Streamable HTTP transport. Stateless: no
 * session ID, and a fresh Server + StreamableHTTPServerTransport pair per
 * request (the pattern the MCP SDK documents for stateless mode), rather
 * than sharing one Server across concurrent requests.
 */
async function handleHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("OK");
    return;
  }

  if (url.pathname !== "/mcp") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed — this server only supports POST /mcp." }, { Allow: "POST" });
    return;
  }

  if (!isAuthorized(req)) {
    sendJson(res, 401, { error: "Unauthorized — missing or invalid bearer token." });
    return;
  }

  const requestServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  try {
    await requestServer.connect(transport);
    await transport.handleRequest(req, res);
    res.on("close", () => {
      transport.close();
      requestServer.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
}

/**
 * Starts the Streamable HTTP transport on the given port (from
 * process.env.PORT — hosting platforms set this automatically, so it's
 * never hardcoded).
 */
function startHttpServer(port: number): void {
  const httpServer = createNodeHttpServer((req, res) => {
    handleHttpRequest(req, res).catch((error: unknown) => {
      console.error("Unhandled error in HTTP request listener:", error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal server error" });
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`MCP HTTP server listening on port ${port} (POST /mcp, GET /health)`);
  });
}

/**
 * Picks stdio vs HTTP automatically: process.env.PORT set → HTTP (hosted
 * deployment); unset → stdio (local Claude Code usage via .mcp.json keeps
 * working unchanged).
 */
async function main(): Promise<void> {
  const port = process.env.PORT;

  if (port !== undefined) {
    const portNumber = Number(port);
    if (!Number.isInteger(portNumber) || portNumber <= 0) {
      throw new Error(`Invalid PORT env var: "${port}" — expected a positive integer.`);
    }
    startHttpServer(portNumber);
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/**
 * Only auto-start (stdio or HTTP, per main()) when this file is run directly
 * (e.g. `npm run mcp` or `npm start`), not when it's imported — tests import
 * `server` and drive it over an in-memory transport instead.
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
