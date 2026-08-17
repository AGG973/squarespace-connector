# squarespace.list_orders

List orders, filterable by modification time window or fulfillment status. Read-only, `GET /orders`.

Response below is the real captured order from `fixtures/orders-populated.json` — `customerEmail` replaced with a placeholder, every other field verbatim.

## Request

```json
{}
```

## Response

```json
{
  "orders": [
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
  ],
  "pagination": {
    "nextPageUrl": null,
    "nextPageCursor": null,
    "hasNextPage": false
  }
}
```

Note: the raw Squarespace response's top-level array key is `result`, not `orders` — `listOrders()` renames it. See `fixtures/orders-populated.json` for the untrimmed capture (includes `internalNotes`, `shippingLines`, `discountLines`, etc., all empty on this order) and `src/schemas/list-orders.schema.json` for the complete contract, including the confirmed cursor-combination and `modifiedAfter`/`modifiedBefore` pairing rules documented in `connector.yaml`.
