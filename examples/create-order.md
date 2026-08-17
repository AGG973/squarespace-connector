# squarespace.create_order

Create a new order. Write, `POST /orders`. **Irreversible**, rate-limited (100/hour/site), and marked `requires_approval: true` in `connector.yaml`.

The request below is the real request that produced the response captured in `fixtures/create-order-response.json` — `customerEmail` replaced with a placeholder, every other field verbatim.

## Request

```json
{
  "channelName": "DOO Connector Test",
  "externalOrderReference": "TEST-CONNECTOR-002",
  "createdOn": "2026-08-16T08:14:10Z",
  "priceTaxInterpretation": "EXCLUSIVE",
  "fulfillments": [],
  "lineItems": [
    {
      "lineItemType": "PHYSICAL_PRODUCT",
      "variantId": "303079a3-a085-45aa-8814-ce63e140c2b4",
      "quantity": 1,
      "unitPricePaid": { "currency": "USD", "value": "20.00" }
    }
  ],
  "subtotal": { "currency": "USD", "value": "20.00" },
  "grandTotal": { "currency": "USD", "value": "20.00" },
  "customerEmail": "buyer@example.com"
}
```

`subtotal` is confirmed (2026-08-16) to be functionally required, despite being modeled as optional on Squarespace's documented contract — omitting it gets a 400. It must equal the sum of `lineItems[].unitPricePaid.value`. See `connector.yaml`'s `known_limitations`.

## Response

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
  "paymentState": "PAID",
  "idempotencyKey": "53cbf878-2dcc-4b5d-930f-ab5cf8b3f65d"
}
```

`idempotencyKey` is sent as the `Idempotency-Key` header (auto-generated if omitted from the input), and Squarespace echoes it back in the response body too. See `fixtures/create-order-response.json` for the untrimmed capture and `src/schemas/create-order.schema.json` for the complete contract.
