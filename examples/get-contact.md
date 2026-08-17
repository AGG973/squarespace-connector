# squarespace.get_contact

Retrieve a single contact record by id. Read-only, `GET /contacts/{id}`.

Request/response below use the real contact captured in `fixtures/contact-by-id.json` — `email` replaced with a placeholder, every other field verbatim.

## Request

```json
{ "id": "6a7afd9c3a715540f23e0a54" }
```

## Response

```json
{
  "contact": {
    "id": "6a7afd9c3a715540f23e0a54",
    "createdOn": "2026-08-11T10:46:52.880876Z",
    "firstName": "Alya",
    "lastName": "",
    "locale": null,
    "primaryEmail": {
      "createdOn": "2026-08-11T10:46:52.880876Z",
      "email": "buyer@example.com",
      "acceptsMarketing": {
        "acceptsMarketing": true,
        "joinedOn": "2026-08-11T10:46:52.925359Z",
        "leftOn": null
      }
    },
    "defaultShippingAddress": null
  }
}
```

Note the response is wrapped in a top-level `contact` key — not flat. `tags` and internal notes are confirmed (2026-08-16) to never appear in this response at all, even when genuinely present on the contact — see `connector.yaml`'s `known_limitations` for the reproducible test methodology. See `src/schemas/get-contact.schema.json` for the complete contract.
