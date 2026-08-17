# squarespace.list_products

List products in the store catalog. Read-only, `GET /products`.

Request/response below use the real product captured in `fixtures/products.json` (trimmed to one product/variant for readability — the real response has 4 products, 18 variants total).

## Request

```json
{ "limit": 1 }
```

`limit` is documented but confirmed (2026-08-16) to be silently ignored below Squarespace's own ~50-item default page size — see `connector.yaml`'s `known_limitations`. This example still shows it being passed, since it's harmless, just not effective at this catalog size.

## Response

```json
{
  "products": [
    {
      "id": "6a72f2378d7a8a3a29161789",
      "type": "PHYSICAL",
      "storePageId": "6a72f2207b60d851f2d2f110",
      "name": "Test Product — Canvas Tote Bag",
      "description": "<p style=\"white-space:pre-wrap;\" data-rte-preserve-empty=\"true\">Sample product created for Squarespace connector testing.</p>",
      "url": "https://jaguar-mandolin-z8g5.squarespace.com/shop/p/test-product-canvas-tote-bag",
      "urlSlug": "p/test-product-canvas-tote-bag",
      "images": [
        {
          "id": "6a72f40a98f72327f79ad890",
          "altText": "tote bag.jpg",
          "orderIndex": 0,
          "url": "https://images.squarespace-cdn.com/content/v1/6a72f2207b60d851f2d2f0f0/b80ab8e5-dfd9-4329-b18d-aa853d6c982a/tote+bag.jpg",
          "originalSize": { "width": 1200, "height": 1600 },
          "availableFormats": []
        }
      ],
      "tags": [],
      "isVisible": false,
      "variantAttributes": ["Size"],
      "variants": [
        {
          "id": "303079a3-a085-45aa-8814-ce63e140c2b4",
          "sku": "SQ4985207",
          "pricing": {
            "basePrice": { "currency": "USD", "value": "20.00" },
            "salePrice": { "currency": "USD", "value": "0.00" },
            "onSale": false
          },
          "stock": { "quantity": 10, "unlimited": false },
          "attributes": { "Size": "Small" },
          "shippingMeasurements": {
            "weight": { "unit": "POUND", "value": 0 },
            "dimensions": { "unit": "INCH", "length": 0, "width": 0, "height": 0 }
          },
          "image": null
        }
      ],
      "seoOptions": null,
      "createdOn": "2026-08-05T08:20:07.834Z",
      "modifiedOn": "2026-08-05T08:27:55.973Z",
      "pricing": null,
      "digitalGood": null
    }
  ],
  "pagination": {
    "nextPageUrl": null,
    "nextPageCursor": null,
    "hasNextPage": false
  }
}
```

See `fixtures/products.json` for the full 4-product capture, and `src/schemas/list-products.schema.json` for the complete field-by-field contract.
