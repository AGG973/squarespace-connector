# testConnection

Verifies the configured `SQUARESPACE_API_KEY` can reach the Squarespace API. Not one of the five `connector.yaml` actions — a lightweight MCP tool defined directly in `src/connector.ts`, since Squarespace documents no dedicated "site info" endpoint. Internally it's just `GET /products?limit=1`, the cheapest confirmed-working read.

## Request

```json
{}
```

## Response — success

```json
{ "success": true }
```

## Response — failure

Never throws — connection failures are returned, not raised:

```json
{
  "success": false,
  "error": {
    "code": "AUTHORIZATION_ERROR",
    "message": "...",
    "httpStatus": 401,
    "requestId": "...",
    "retryable": false
  }
}
```

The `error` shape matches the normalized error contract in `connector.yaml`'s `error_handling` section — see `src/errors/normalize.ts`.
