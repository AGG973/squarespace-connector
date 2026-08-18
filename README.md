# squarespace-connector

A typed connector for the Squarespace Commerce (`1.0`) and Contacts (`v1`) APIs, exposing six actions through both a direct TypeScript interface (`src/connector.ts`) and an MCP server (`mcp/server.ts`) — stdio for local use, Streamable HTTP for hosted deployment.

## What this connector does

Authenticates with a Squarespace personal Developer API Key (sent as a Bearer token) and wraps the REST API behind a small, typed action surface. Requests are validated client-side against confirmed live API behavior before being sent, and Squarespace's error responses are normalized into a consistent shape:

```
{ code, message, httpStatus, requestId, retryable }
```

## Actions

| Action | Kind | Description |
|---|---|---|
| `squarespace.list_products` | read | List products in the store catalog. |
| `squarespace.get_or_adjust_inventory` | read/write | Read current inventory levels or submit an inventory adjustment. |
| `squarespace.list_orders` | read | List orders, filterable by modification time window or fulfillment status. |
| `squarespace.create_order` | write | Create a new order. Irreversible, rate-limited (100/hour/site), and requires approval before execution. |
| `squarespace.get_contact` | read | Retrieve a single contact record by id. |
| `squarespace.list_contacts` | read | List contacts. Added beyond the original 5 — reuses `get_contact`'s confirmed envelope/shape; its own cursor behavior is unconfirmed. |

## Setup

### Prerequisites

- A Squarespace site on the Core plan or higher — Orders, Inventory, and Contacts all require it.
- A Developer API Key with the scopes needed for the actions you plan to use.

### Environment variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|---|---|---|
| `SQUARESPACE_API_KEY` | Yes | Personal Developer API Key, sent as a Bearer token in the `Authorization` header. |
| `PORT` | HTTP mode only | Selects the transport: set → HTTP; unset → stdio. Hosting platforms normally set this automatically — don't hardcode it. |
| `MCP_AUTH_TOKEN` | HTTP mode only | Bearer token required on every `POST /mcp` request, checked against the request's `Authorization` header. Separate from `SQUARESPACE_API_KEY` — this one protects access to *this* server, not Squarespace's. Requests without it are rejected with 401 (fails closed if unset). |

### Running locally (stdio)

```
npm install
cp .env.example .env   # then fill in SQUARESPACE_API_KEY; leave PORT and MCP_AUTH_TOKEN unset
npm run mcp
```

This starts the MCP server over stdio, exposing `testConnection` plus the five `squarespace.*` tools listed above. `.mcp.json` already has an entry for it (`node --env-file-if-exists=.env mcp/server.ts`) for MCP clients that read that file directly.

### Running via HTTP

For hosted/remote deployment, `mcp/server.ts` also implements the MCP SDK's Streamable HTTP transport. Mode is chosen automatically at startup: if `PORT` is set, the server runs as HTTP instead of stdio.

```
PORT=3000 MCP_AUTH_TOKEN=<a long random secret> npm start
```

- `POST /mcp` — the MCP endpoint. Requires `Authorization: Bearer <MCP_AUTH_TOKEN>`; missing or wrong token gets a 401. Stateless: no session ID, a fresh internal server instance per request.
- `GET /health` — unauthenticated 200 OK, for the hosting platform's own uptime checks.

Most hosting platforms set `PORT` for you automatically, so in practice deploying just means setting `SQUARESPACE_API_KEY` and `MCP_AUTH_TOKEN` and pointing the platform at `npm start`.

### Other useful scripts

| Script | Purpose |
|---|---|
| `npm test` | Run the test suite (fully mocked — never touches the live API). |
| `npm run typecheck` | TypeScript check, no emit. |
| `npm run check` | Live connectivity smoke test (`src/check-connection.ts`). |
| `npm run check:actions` | Live smoke test for the read actions (`src/check-actions.ts`). |
| `npm run generate:openapi` | Regenerate `openapi.yaml` from `src/schemas/*.json`. |
| `npm run validate:openapi` | Lint `openapi.yaml` with Redocly. |

## Known Limitations

Pulled directly from `connector.yaml`'s `known_limitations`:

- create_order's earlier conclusion here — confirmed platform-level access limitation, restricted to OAuth/registered Extension apps — is DISPROVEN. CONFIRMED live, 2026-08-16 — a real order was successfully created via a personal Developer API Key (order created, $20.00 USD, PAID; no PII recorded here). The actual blocker was never authorization — Squarespace returns 400 INVALID_REQUEST_ERROR.unknown, "The sum of lineItems.unitPricePaid.value must equal subtotal.value," when `subtotal` is omitted. `subtotal` was previously modeled as optional on the request; it is now confirmed functionally required — must be present and equal to the sum of lineItems[].unitPricePaid.value. Schema, action, and tests updated to require it.
- get_contact's response shape was initially modeled from a placeholder fixture and was substantially wrong. CONFIRMED live, 2026-08-11, against one real contact — the actual response is wrapped in a top-level `contact` key (not flat), uses `primaryEmail.{email, acceptsMarketing}` instead of flat `email`/`transactionalEmailStatus`, and has no `phoneNumbers`/`notes`/`lists`/`tags`/`lastModifiedOn` fields (schema/action/tests updated to match). CONFIRMED live, 2026-08-16, that `tags` and internal notes specifically are excluded from this endpoint's response entirely, not merely absent because the earlier tested contact happened to lack them. Methodology (reproducible) — a real tag ("Test") and note ("test") were added to that same test contact via the Squarespace admin UI, confirmed saved and visible in the dashboard; the contact was then re-fetched via get_contact twice, and both responses were byte-identical to each other and to the pre-tag/note baseline, with no trace of either field before or after. `lists` remains unconfirmed either way — not exercised by this test, so its absence is still only inferred from the one original record.
- list_orders' real shape for a populated order object — previously unverified, since the store had zero real orders — is now CONFIRMED live, 2026-08-16, against the real order created earlier that same day. The populated response exactly matches create_order's captured response shape (same fields, same nesting, same line-item shape — see fixtures/create-order-response.json and fixtures/orders.json). Schema ($defs.order/$defs.lineItem in list-orders.schema.json) and fixtures updated to match.
- list_products' `limit` parameter — previously logged as inconclusive — is now CONFIRMED, 2026-08-16, via three live data points — limit:2 on a 4-product catalog → ignored, all 4 products returned, hasNextPage:false; limit:3 on a 10-product catalog → ignored, all 10 products returned, hasNextPage:false; no limit specified on a 51-product catalog → Squarespace applied its own default page size of 50, hasNextPage:true, with a real, usable nextPageCursor returned. CONFIRMED conclusion — `limit` does not reduce Squarespace's page size below its own ~50 default; requesting a smaller value is silently ignored. Pagination itself is fully functional and correctly triggers once the catalog exceeds that default, with a working cursor for subsequent pages. Practical implication for callers — don't rely on `limit` to control page size below 50; to page through more than 50 products, use cursor-based pagination as normal, which is confirmed working.
- list_orders' cursor paging-combination rules are now CONFIRMED live, 2026-08-16, via all four combinations tested directly against the API (a 56-order store was built specifically to produce a real pagination cursor) — cursor alone → works; cursor + limit → accepted, both succeed together; cursor + modifiedAfter/modifiedBefore (paired) → rejected, 400 INVALID_REQUEST_ERROR.INVALID_ARGUMENT, "Cursor cannot be set while other parameters are present."; cursor + fulfillmentStatus → rejected, same error. CONFIRMED conclusion — cursor specifically excludes modifiedAfter, modifiedBefore, and fulfillmentStatus, but NOT limit; this is narrower than list_products' confirmed rule that cursor must be the only parameter sent, so the two endpoints' cursor rules must not be assumed to match. A separate, also-confirmed rule surfaced during this same investigation — modifiedAfter and modifiedBefore must both be present or both be absent; sending one without the other is rejected with 400 INVALID_REQUEST_ERROR.MISSING_ARGUMENT, "'modifiedBefore' and 'modifiedAfter' must both be specified." This pairing requirement had previously been removed from validation as unconfirmed; it is now reinstated in assertValidInput and the schema's dependentRequired. Schema ($defs/dependentSchemas/dependentRequired in list-orders.schema.json), action (assertValidInput in list-orders.ts), and tests updated to match — no inferred or unconfirmed language remains for any of these four combinations.

See `connector.yaml` for the full manifest, including `risks` (forward-looking/unconfirmed items) and the exact request/error-handling contracts.
