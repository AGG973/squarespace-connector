# squarespace.get_or_adjust_inventory

Read current inventory levels, or submit a stock adjustment. `GET /inventory` (read) or `POST /inventory/adjustments` (write). Mode is inferred from the input — no explicit flag.

## Read mode (`get_inventory`)

Request/response below use real entries captured in `fixtures/inventory.json` (trimmed to 3 of the 21 captured records for readability).

### Request

```json
{ "operation": "get_inventory", "limit": 3 }
```

`limit` is confirmed (2026-08-16) to be silently ignored, same pattern as `list_products` — see `connector.yaml`'s `known_limitations`.

### Response

```json
{
  "inventory": [
    { "variantId": "109e1be8-8aa4-4c61-a0f0-30a4f590f8f2", "sku": "SQ1157834", "descriptor": "Terra chunk [6]", "quantity": 1, "isUnlimited": false },
    { "variantId": "303079a3-a085-45aa-8814-ce63e140c2b4", "sku": "SQ4985207", "descriptor": "Test Product — Canvas Tote Bag [Small]", "quantity": 10, "isUnlimited": false },
    { "variantId": "627d44e9-3f68-4ea4-a34b-794dcbbbc6db", "sku": "SQ5971216", "descriptor": "Test Product — Canvas Tote Bag [Medium]", "quantity": 10, "isUnlimited": false }
  ],
  "pagination": { "nextPageUrl": null, "nextPageCursor": null, "hasNextPage": false }
}
```

## Write mode (`adjust_inventory`)

No fixture has been captured for this response yet (there's no `fixtures/inventory-adjustment.json`), so no example is shown here to avoid inventing data. What's confirmed live (2026-08-16, see `connector.yaml`): a real `incrementOperations`/`setFiniteOperations` round trip against a real variant succeeds and takes effect, returning `{ "adjusted": true }`. The general request shape:

```json
{
  "operation": "adjust_inventory",
  "incrementOperations": [
    { "variantId": "303079a3-a085-45aa-8814-ce63e140c2b4", "quantity": 1 }
  ]
}
```

See `src/schemas/get-or-adjust-inventory.schema.json` for the complete contract, including `setFiniteOperations` (absolute levels, used to decrement) and `setUnlimitedOperations`.
