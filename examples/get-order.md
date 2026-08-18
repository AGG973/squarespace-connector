# squarespace.get_order

Retrieve a single order by id. Read-only, `GET /orders/{id}`.

A 7th action, added beyond connector.yaml's originally-scoped 5 plus `list_contacts`, once those six were complete. It reuses the already-confirmed order object shape from `squarespace.create_order`/`squarespace.list_orders` rather than modeling it fresh — see `src/schemas/create-order.schema.json`/`src/schemas/list-orders.schema.json`'s `$defs.order`, both live-verified 2026-08-16.

**This endpoint itself has never been called live.** The request/response below is illustrative: the order object is the real, confirmed shape (verbatim from `fixtures/create-order-response.json`, `customerEmail` replaced with a placeholder), shown under the assumption — not a finding — that `GET /orders/{id}` returns it flat, by analogy to `create_order`'s confirmed flat response on the same commerce API. `squarespace.get_contact` is direct precedent in this project for that kind of analogy turning out wrong: its GET-by-id response turned out to be wrapped in a top-level `contact` key, a correction from an earlier flat placeholder model. Treat this example, and this action, as needing live verification before production use.

## Request

```json
{ "id": "6a81716f0589b404e7529648" }
```

## Response (illustrative — see caveat above)

```json
{
  "id": "6a81716f0589b404e7529648",
  "orderNumber": "1",
  "createdOn": "2026-08-16T08:14:10Z",
  "modifiedOn": "2026-08-16T08:14:39.705Z",
  "channel": "external",
  "testmode": false,
  "customerEmail": "buyer@example.com",
  "customerId": "6a7afd9c3a715540f23e0a54",
  "billingAddress": null,
  "shippingAddress": null,
  "fulfillmentStatus": "PENDING",
  "lineItems": [
    {
      "id": "6a81716fc8fe4c0001305355",
      "variantId": "303079a3-a085-45aa-8814-ce63e140c2b4",
      "sku": "SQ4985207",
      "productId": "6a72f2378d7a8a3a29161789",
      "productName": "Test Product — Canvas Tote Bag",
      "quantity": 1,
      "unitPricePaid": { "currency": "USD", "value": "20.00" },
      "lineItemType": "PHYSICAL_PRODUCT"
    }
  ],
  "subtotal": { "currency": "USD", "value": "20.00" },
  "grandTotal": { "currency": "USD", "value": "20.00" },
  "channelName": "DOO Connector Test",
  "externalOrderReference": "TEST-CONNECTOR-002",
  "priceTaxInterpretation": "EXCLUSIVE",
  "paymentState": "PAID"
}
```

See `src/schemas/get-order.schema.json` for the complete contract, including exactly what's confirmed (the order object shape) versus unconfirmed (this endpoint's own existence, its behavior for a missing id, and whether the real response is wrapped or flat), and `connector.yaml`'s `known_limitations` for the full note.
