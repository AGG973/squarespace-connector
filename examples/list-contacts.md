# squarespace.list_contacts

List contacts. Read-only, `GET /contacts`.

A 6th action, added beyond connector.yaml's originally-scoped 5, once those five were complete. It reuses the response envelope and per-contact shape already confirmed via `squarespace.get_contact`'s live testing, rather than modeling them fresh — see `src/schemas/get-contact.schema.json`'s `contactListResult` $def, which was documented specifically so this action could reuse it later.

Request/response below use the real, empty `GET /contacts` response captured in `fixtures/contacts.json` (2026-08-11) — the only data point this endpoint has itself produced live. A populated response's per-contact fields are inferred from `get_contact`'s separate live testing (`fixtures/contact-by-id.json`), not observed through `list_contacts` itself — see the schema's VERIFICATION STATUS.

## Request

```json
{}
```

## Response

```json
{
  "contacts": [],
  "pagination": {
    "nextPageUrl": null,
    "nextPageCursor": null,
    "hasNextPage": false
  }
}
```

`cursor` is accepted as an optional input, modeled by analogy to `list_products`/`list_orders`, but this endpoint's own cursor behavior — whether it combines with other parameters, or excludes any — has NOT been tested live. Don't assume it matches either endpoint's confirmed rules; see `connector.yaml`'s `known_limitations`.

See `fixtures/contacts.json` for the full captured envelope, `fixtures/contact-by-id.json` for the confirmed per-contact shape, and `src/schemas/list-contacts.schema.json` for the complete contract.
