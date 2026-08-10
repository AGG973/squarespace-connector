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

  return (
    schema.$defs ? { ...inputSchema, $defs: schema.$defs } : inputSchema
  ) as Tool["inputSchema"];
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

  if (name === "squarespace.list_products" || name === "squarespace.list_orders") {
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
