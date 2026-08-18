/**
 * Generates openapi.yaml — the REST/HTTP surface for this connector
 * (not yet deployed) — from src/schemas/*.json and connector.yaml.
 *
 * Assembles components/schemas programmatically from the already-verified
 * action schemas rather than hand-retyping them: same reasoning as the
 * fixture-capture scripts (src/check-actions.ts etc.) — avoids
 * transcription drift from files that are already correct.
 *
 * Run: node src/generate-openapi.ts
 * The output is a generated file — re-run this script to update it,
 * don't hand-edit openapi.yaml directly.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SCHEMAS_DIR = fileURLToPath(new URL("./schemas/", import.meta.url));

interface ConnectorYamlAction {
  id: string;
  description: string;
  kind?: string;
  request?: { method: string; base_url: string; path: string };
  required_headers?: { name: string; required: boolean; notes?: string }[];
  rate_limit?: { limit: number; period: string; scope: string };
  reversible?: boolean;
  requires_approval?: boolean;
  operations?: {
    name: string;
    kind: string;
    request: { method: string; base_url: string; path: string };
    required_headers?: { name: string; required: boolean }[];
    reversible?: boolean;
    reversal_notes?: string;
  }[];
}

interface ConnectorYaml {
  version: string;
  provider: string;
  auth: { notes: string };
  error_handling: { normalized_shape: Record<string, string> };
  risks: string[];
  actions: ConnectorYamlAction[];
}

const connectorYaml = parseYaml(readFileSync(`${ROOT}connector.yaml`, "utf8")) as ConnectorYaml;
const packageJson = JSON.parse(readFileSync(`${ROOT}package.json`, "utf8")) as { license?: string };

function pascal(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Deep-clones `node`, rewriting local `#/$defs/X` refs to the flattened `#/components/schemas/<prefix>X` form. */
function rewriteRefs(node: unknown, prefix: string): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => rewriteRefs(item, prefix));
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "$ref" && typeof value === "string" && value.startsWith("#/$defs/")) {
        out[key] = `#/components/schemas/${prefix}${pascal(value.slice("#/$defs/".length))}`;
      } else {
        out[key] = rewriteRefs(value, prefix);
      }
    }
    return out;
  }
  return node;
}

interface LoadedSchema {
  raw: any;
  prefix: string;
}

const schemaCache = new Map<string, LoadedSchema>();
function loadSchema(file: string, prefix: string): LoadedSchema {
  let loaded = schemaCache.get(file);
  if (!loaded) {
    const raw = JSON.parse(readFileSync(`${SCHEMAS_DIR}${file}`, "utf8"));
    loaded = { raw, prefix };
    schemaCache.set(file, loaded);
  }
  return loaded;
}

const componentsSchemas: Record<string, unknown> = {};
const registeredFiles = new Set<string>();

/**
 * Flattens one schema file's $defs into components/schemas, plus its
 * top-level input/output wrapper — but only the wrapper half(s) some route
 * actually $refs directly. GetOrAdjustInventory's operations, for example,
 * each pull a specific $defs entry (getInventoryInput, etc.) instead of the
 * file's top-level oneOf, so that top-level Input/Output would otherwise be
 * dead weight flagged by openapi linters as unused components.
 */
function registerComponents(
  { raw, prefix }: LoadedSchema,
  usesTopLevelInput: boolean,
  usesTopLevelOutput: boolean,
): void {
  if (registeredFiles.has(prefix)) return;
  registeredFiles.add(prefix);

  for (const [defKey, defSchema] of Object.entries<any>(raw.$defs ?? {})) {
    componentsSchemas[`${prefix}${pascal(defKey)}`] = rewriteRefs(defSchema, prefix);
  }
  if (usesTopLevelInput) {
    componentsSchemas[`${prefix}Input`] = rewriteRefs(raw.properties.input, prefix);
  }
  if (usesTopLevelOutput) {
    componentsSchemas[`${prefix}Output`] = rewriteRefs(raw.properties.output, prefix);
  }
}

componentsSchemas.ErrorResponse = {
  title: "ErrorResponse",
  description:
    "Normalized error shape. Assembled from connector.yaml's error_handling.normalized_shape, not retyped.",
  type: "object",
  required: Object.keys(connectorYaml.error_handling.normalized_shape),
  properties: Object.fromEntries(
    Object.entries(connectorYaml.error_handling.normalized_shape).map(([field, type]) => [
      field,
      { type },
    ]),
  ),
};

componentsSchemas.TestConnectionOutput = {
  title: "TestConnectionResult",
  description:
    "Not backed by a src/schemas/*.json file — mirrors src/connector.ts's TestConnectionResult type (INFERRED from that type, not independently schema-verified).",
  oneOf: [
    {
      type: "object",
      required: ["success"],
      additionalProperties: false,
      properties: { success: { const: true } },
    },
    {
      type: "object",
      required: ["success", "error"],
      additionalProperties: false,
      properties: {
        success: { const: false },
        error: { description: "The raw thrown error value; shape varies by failure mode." },
      },
    },
  ],
};

type InputMode = "query" | "path" | "body" | "none";

interface ActionRoute {
  schemaFile: string | null;
  prefix: string;
  connectorActionId: string | null;
  operationSubName?: string; // for connector.yaml actions with an `operations` sub-list
  operationId: string;
  method: "get" | "post";
  path: string;
  inputMode: InputMode;
  inputDefKey?: string; // pull this $defs entry instead of the file's top-level input
  outputDefKey?: string;
  requiresIdempotencyKey?: boolean;
  discriminatorExampleValue?: string; // filters raw.examples by input.operation
}

const ROUTES: ActionRoute[] = [
  {
    schemaFile: "list-products.schema.json",
    prefix: "ListProducts",
    connectorActionId: "squarespace.list_products",
    operationId: "listProducts",
    method: "get",
    path: "/products",
    inputMode: "query",
  },
  {
    schemaFile: "get-or-adjust-inventory.schema.json",
    prefix: "GetOrAdjustInventory",
    connectorActionId: "squarespace.get_or_adjust_inventory",
    operationSubName: "get_inventory",
    operationId: "getInventory",
    method: "get",
    path: "/inventory",
    inputMode: "query",
    inputDefKey: "getInventoryInput",
    outputDefKey: "getInventoryOutput",
    discriminatorExampleValue: "get_inventory",
  },
  {
    schemaFile: "get-or-adjust-inventory.schema.json",
    prefix: "GetOrAdjustInventory",
    connectorActionId: "squarespace.get_or_adjust_inventory",
    operationSubName: "adjust_inventory",
    operationId: "adjustInventory",
    method: "post",
    path: "/inventory/adjustments",
    inputMode: "body",
    inputDefKey: "adjustInventoryInput",
    outputDefKey: "adjustInventoryOutput",
    requiresIdempotencyKey: true,
    discriminatorExampleValue: "adjust_inventory",
  },
  {
    schemaFile: "list-orders.schema.json",
    prefix: "ListOrders",
    connectorActionId: "squarespace.list_orders",
    operationId: "listOrders",
    method: "get",
    path: "/orders",
    inputMode: "query",
  },
  {
    schemaFile: "create-order.schema.json",
    prefix: "CreateOrder",
    connectorActionId: "squarespace.create_order",
    operationId: "createOrder",
    method: "post",
    path: "/orders",
    inputMode: "body",
    requiresIdempotencyKey: true,
  },
  {
    schemaFile: "get-contact.schema.json",
    prefix: "GetContact",
    connectorActionId: "squarespace.get_contact",
    operationId: "getContact",
    method: "get",
    path: "/contacts/{id}",
    inputMode: "path",
  },
  {
    schemaFile: "list-contacts.schema.json",
    prefix: "ListContacts",
    connectorActionId: "squarespace.list_contacts",
    operationId: "listContacts",
    method: "get",
    path: "/contacts",
    inputMode: "query",
  },
  {
    schemaFile: null,
    prefix: "TestConnection",
    connectorActionId: null,
    operationId: "testConnection",
    method: "post",
    path: "/test-connection",
    inputMode: "none",
  },
];

function findConnectorAction(id: string): ConnectorYamlAction | undefined {
  return connectorYaml.actions.find((a) => a.id === id);
}

function schemaFragment(raw: any, defKey: string | undefined, kind: "input" | "output"): any {
  return defKey ? raw.$defs[defKey] : raw.properties[kind];
}

function pickExample(raw: any, discriminatorValue?: string): any {
  const examples: any[] = raw.examples ?? [];
  if (!examples.length) return null;
  if (discriminatorValue) {
    return examples.find((e) => e.input?.operation === discriminatorValue) ?? null;
  }
  return examples[0];
}

const ERROR_STATUS_DESCRIPTIONS: Record<string, string> = {
  "400": "Bad request — input failed validation. See ErrorResponse for details.",
  "401":
    "Unauthorized — this API's own bearer token is missing/invalid, or (POST /orders specifically) the " +
    "underlying Squarespace API key lacks authorization; see connector.yaml's risks entry on create_order.",
  "429": "Rate limited.",
  "500": "Unexpected server error.",
};

function errorResponses(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(ERROR_STATUS_DESCRIPTIONS).map(([status, description]) => [
      status,
      {
        description,
        content: {
          "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } },
        },
      },
    ]),
  );
}

function describeOperation(route: ActionRoute): string {
  const parts: string[] = [];

  if (route.connectorActionId) {
    const action = findConnectorAction(route.connectorActionId);
    const op = route.operationSubName
      ? action?.operations?.find((o) => o.name === route.operationSubName)
      : undefined;

    if (op) {
      parts.push(`${action!.description} (${op.name}: ${op.kind}).`);
      if (op.reversible !== undefined) {
        parts.push(op.reversible ? `Reversible: ${op.reversal_notes}` : "Irreversible.");
      }
    } else if (action) {
      parts.push(action.description);
      if (action.reversible === false) parts.push("Irreversible.");
      if (action.requires_approval) parts.push("Requires approval before execution per connector.yaml.");
      if (action.rate_limit) {
        const rl = action.rate_limit;
        parts.push(`Rate-limited to ${rl.limit} calls per ${rl.period}, ${rl.scope}.`);
      }
    }
  } else {
    parts.push(
      "Verifies that the configured Squarespace API key can reach the API (a live GET /products?limit=1 " +
        "server-side). Not one of connector.yaml's 5 declared actions — an operational helper exposed by " +
        "src/connector.ts's testConnection() and mcp/server.ts.",
    );
  }

  return parts.join(" ");
}

function buildOperation(route: ActionRoute): Record<string, unknown> {
  const loaded = route.schemaFile ? loadSchema(route.schemaFile, route.prefix) : null;
  const example = loaded ? pickExample(loaded.raw, route.discriminatorExampleValue) : null;

  const outputRef = loaded
    ? `#/components/schemas/${route.outputDefKey ? route.prefix + pascal(route.outputDefKey) : route.prefix + "Output"}`
    : "#/components/schemas/TestConnectionOutput";

  const parameters: Record<string, unknown>[] = [];
  let requestBody: Record<string, unknown> | undefined;
  const notes: string[] = [];
  let fullInputSchemaRef: string | undefined;

  if (route.inputMode === "query" || route.inputMode === "path") {
    const fragment = schemaFragment(loaded!.raw, route.inputDefKey, "input");
    const required: string[] = fragment.required ?? [];

    for (const [key, propSchema] of Object.entries<any>(fragment.properties ?? {})) {
      // The `operation` discriminator is an artifact of the schema file's internal
      // oneOf (used to pick get_inventory vs adjust_inventory); it's redundant here
      // since this endpoint's method+path already disambiguates that.
      if (key === "operation" && "const" in propSchema) continue;

      parameters.push({
        name: key,
        in: route.inputMode,
        required: route.inputMode === "path" ? true : required.includes(key),
        schema: rewriteRefs(propSchema, route.prefix),
        ...(propSchema.description ? { description: propSchema.description } : {}),
        ...(example?.input?.[key] !== undefined ? { example: example.input[key] } : {}),
      });
    }

    if (fragment.dependentSchemas || fragment.anyOf || fragment.oneOf || fragment.if) {
      const refName = route.inputDefKey
        ? `${route.prefix}${pascal(route.inputDefKey)}`
        : `${route.prefix}Input`;
      fullInputSchemaRef = `#/components/schemas/${refName}`;
      notes.push(
        `Cross-field constraints on this input (e.g. mutually exclusive parameters) are defined in the ` +
          `full JSON Schema referenced below as x-full-input-schema (components.schemas.${refName}) and are ` +
          `not fully expressible as independent OpenAPI parameters here — validate against that schema for ` +
          `authoritative behavior.`,
      );
    }
  } else if (route.inputMode === "body") {
    const inputRef = route.inputDefKey
      ? `#/components/schemas/${route.prefix}${pascal(route.inputDefKey)}`
      : `#/components/schemas/${route.prefix}Input`;
    requestBody = {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: inputRef },
          ...(example?.input !== undefined ? { example: example.input } : {}),
        },
      },
    };
  }

  if (route.requiresIdempotencyKey) {
    parameters.push({
      name: "Idempotency-Key",
      in: "header",
      required: false,
      description:
        "Optional — a fresh UUID is generated server-side when omitted, and the caller's value is reused " +
        "verbatim when supplied, so a caller can control retries deliberately.",
      schema: { type: "string", format: "uuid" },
    });
  }

  const description = [describeOperation(route), ...notes].join(" ");

  return {
    operationId: route.operationId,
    summary: describeOperation(route).split(/(?<=[.!?])\s/)[0],
    description,
    ...(route.connectorActionId ? { "x-connector-action-id": route.connectorActionId } : {}),
    ...(fullInputSchemaRef ? { "x-full-input-schema": { $ref: fullInputSchemaRef } } : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(requestBody ? { requestBody } : {}),
    responses: {
      "200": {
        description: "Successful response.",
        content: {
          "application/json": {
            schema: { $ref: outputRef },
            ...(example?.output !== undefined ? { example: example.output } : {}),
          },
        },
      },
      ...errorResponses(),
    },
  };
}

function fragmentHasCrossFieldConstraints(fragment: any): boolean {
  return Boolean(fragment.dependentSchemas || fragment.anyOf || fragment.oneOf || fragment.if);
}

const usesTopLevelInput = new Set(
  ROUTES.filter((r) => {
    if (!r.inputDefKey && r.inputMode === "body") return true;
    // Query/path routes still need the top-level Input component kept around
    // when buildOperation() will emit an x-full-input-schema ref to it (see
    // the dependentSchemas/oneOf/anyOf/if check there) — otherwise that ref
    // would dangle once the "unused" top-level wrapper gets pruned below.
    if (!r.inputDefKey && r.schemaFile && (r.inputMode === "query" || r.inputMode === "path")) {
      return fragmentHasCrossFieldConstraints(loadSchema(r.schemaFile, r.prefix).raw.properties.input);
    }
    return false;
  }).map((r) => r.prefix),
);
const usesTopLevelOutput = new Set(
  ROUTES.filter((r) => r.schemaFile && !r.outputDefKey).map((r) => r.prefix),
);

const paths: Record<string, Record<string, unknown>> = {};
for (const route of ROUTES) {
  if (route.schemaFile) {
    registerComponents(
      loadSchema(route.schemaFile, route.prefix),
      usesTopLevelInput.has(route.prefix),
      usesTopLevelOutput.has(route.prefix),
    );
  }
  const pathItem = (paths[route.path] ??= {});
  pathItem[route.method] = buildOperation(route);
}

const doc = {
  openapi: "3.1.0",
  info: {
    title: "Squarespace Connector API",
    version: connectorYaml.version,
    ...(packageJson.license
      ? { license: { name: packageJson.license, identifier: packageJson.license } }
      : {}),
    description:
      `REST/HTTP surface for the ${connectorYaml.provider} connector, wrapping the 6 actions declared in ` +
      `connector.yaml (list_products, get_or_adjust_inventory, list_orders, create_order, get_contact, ` +
      `list_contacts) plus a testConnection operational helper. This describes the connector's OWN future ` +
      `HTTP API — not yet ` +
      `deployed, see the servers block — and is distinct from the Squarespace API itself, which this ` +
      `connector calls server-side. ${connectorYaml.auth.notes.trim()} That Squarespace API key is held ` +
      `server-side and never exposed through this API; the bearer token defined below authenticates callers ` +
      `of THIS API instead. GENERATED by src/generate-openapi.ts from src/schemas/*.json and connector.yaml ` +
      `— do not hand-edit, re-run the generator instead.`,
  },
  servers: [
    {
      url: "https://api.example.invalid",
      description:
        "Placeholder — this connector has not been deployed yet (.invalid is the RFC 2606 reserved TLD for " +
        "non-existent placeholder domains). Replace once a real deployment URL exists.",
    },
  ],
  security: [{ bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description:
          "Bearer token for this connector's own REST/HTTP surface. Separate from the Squarespace API key, " +
          "which this connector holds server-side (see connector.yaml's auth block) and never exposes to " +
          "callers of this API.",
      },
    },
    schemas: componentsSchemas,
  },
};

const yamlBody = stringifyYaml(doc, { lineWidth: 0, aliasDuplicateObjects: false });
const header =
  "# GENERATED FILE — do not hand-edit.\n" +
  "# Run `node src/generate-openapi.ts` to regenerate from src/schemas/*.json and connector.yaml.\n";

writeFileSync(`${ROOT}openapi.yaml`, header + yamlBody);

console.log(`Wrote openapi.yaml — ${Object.keys(paths).length} paths, ${Object.keys(componentsSchemas).length} component schemas.`);
