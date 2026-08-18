import { afterEach, describe, expect, it } from "vitest";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { server } from "../mcp/server.ts";

/**
 * Drives the real `server` (its actual registered tools/list handler, not a
 * re-implementation of it) over a linked in-memory transport pair — no real
 * stdio, no subprocess.
 */
async function connectClient(): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return client;
}

describe("mcp/server tools/list", () => {
  let client: Client | undefined;

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it("returns exactly the 9 expected tools with valid-looking schemas", async () => {
    client = await connectClient();

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      "testConnection",
      "squarespace.list_products",
      "squarespace.list_orders",
      "squarespace.get_or_adjust_inventory",
      "squarespace.create_order",
      "squarespace.get_contact",
      "squarespace.list_contacts",
      "squarespace.get_order",
      "squarespace.get_product",
    ]);

    for (const tool of tools) {
      expect(tool.inputSchema.type).toBe("object");
      expect(typeof tool.description).toBe("string");
      expect(tool.description!.length).toBeGreaterThan(0);
    }

    const listProducts = tools.find((tool) => tool.name === "squarespace.list_products");
    expect(listProducts?.inputSchema.properties).toHaveProperty("cursor");
    expect(listProducts?.inputSchema.properties).toHaveProperty("limit");

    const listOrders = tools.find((tool) => tool.name === "squarespace.list_orders");
    expect(listOrders?.inputSchema.properties).toHaveProperty("modifiedAfter");
    expect(listOrders?.inputSchema.properties).toHaveProperty("fulfillmentStatus");

    const testConnection = tools.find((tool) => tool.name === "testConnection");
    expect(testConnection?.inputSchema.properties).toEqual({});

    const inventory = tools.find((tool) => tool.name === "squarespace.get_or_adjust_inventory");
    // This one's `input` schema is a bare `oneOf` in the source file, with no
    // top-level `properties` — confirms the type:"object" injection in
    // loadInputSchema() ran without losing the oneOf/$defs.
    expect(inventory?.inputSchema.oneOf).toBeInstanceOf(Array);
    expect(inventory?.inputSchema.$defs).toHaveProperty("adjustInventoryInput");

    const createOrder = tools.find((tool) => tool.name === "squarespace.create_order");
    expect(createOrder?.inputSchema.required).toEqual(
      expect.arrayContaining([
        "channelName",
        "createdOn",
        "externalOrderReference",
        "fulfillments",
        "grandTotal",
        "lineItems",
        "priceTaxInterpretation",
      ]),
    );
    // customerEmail was previously (incorrectly) required — reconciled against
    // Squarespace's official contract, 2026-08-10.
    expect(createOrder?.inputSchema.required).not.toContain("customerEmail");
    expect(createOrder?.inputSchema.required).not.toContain("idempotencyKey");

    const getContact = tools.find((tool) => tool.name === "squarespace.get_contact");
    expect(getContact?.inputSchema.required).toEqual(["id"]);
    expect(getContact?.inputSchema.properties).toHaveProperty("id");

    const listContacts = tools.find((tool) => tool.name === "squarespace.list_contacts");
    expect(listContacts?.inputSchema.properties).toHaveProperty("cursor");

    const getOrder = tools.find((tool) => tool.name === "squarespace.get_order");
    expect(getOrder?.inputSchema.required).toEqual(["id"]);
    expect(getOrder?.inputSchema.properties).toHaveProperty("id");

    const getProduct = tools.find((tool) => tool.name === "squarespace.get_product");
    expect(getProduct?.inputSchema.required).toEqual(["id"]);
    expect(getProduct?.inputSchema.properties).toHaveProperty("id");
  });
});
