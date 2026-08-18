# squarespace.get_product

Retrieve a single product by id. Read-only, `GET /products/{id}`.

An 8th action, added beyond connector.yaml's originally-scoped 5 plus `list_contacts` and `get_order`, once those seven were complete. It reuses the already-confirmed product object shape from `squarespace.list_products` rather than modeling it fresh — see `src/schemas/list-products.schema.json`'s `$defs.product`, live-verified against `fixtures/products.json`.

**This endpoint itself has never been called live.** The request/response below is illustrative: the product object is the real, confirmed shape (verbatim from `fixtures/products.json`), shown under the assumption — not a finding — that `GET /products/{id}` returns it flat, by analogy to `create_order`'s confirmed flat response on the same commerce API. `squarespace.get_contact` is direct precedent in this project for that kind of analogy turning out wrong: its GET-by-id response turned out to be wrapped in a top-level `contact` key, a correction from an earlier flat placeholder model. Treat this example, and this action, as needing live verification before production use.

## Request

```json
{ "id": "6a72f2378d7a8a3a29161789" }
```

## Response (illustrative — see caveat above)

```json
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
```

See `src/schemas/get-product.schema.json` for the complete contract, including exactly what's confirmed (the product object shape) versus unconfirmed (this endpoint's own existence, its behavior for a missing id, and whether the real response is wrapped or flat), and `connector.yaml`'s `known_limitations` for the full note.
