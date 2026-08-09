/**
 * Manual, one-off verification against the REAL live Squarespace API — not
 * part of the automated test suite, which is fully mocked. Run with
 * `npm run check:actions` (loads `.env` via --env-file-if-exists).
 *
 * Prints the actual response shapes so they can be checked against the
 * assumptions baked into src/schemas/*.json and fixtures/*.json.
 */

import { listProducts } from "./actions/list-products.ts";
import { listOrders } from "./actions/list-orders.ts";
import { SquarespaceError } from "./client.ts";

async function run(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  console.log(`\n[check-actions] ${label} ...`);
  try {
    const result = await fn();
    console.log(`[check-actions] ${label} OK:`);
    console.log(JSON.stringify(result, null, 2));
    return true;
  } catch (error) {
    console.error(`[check-actions] ${label} FAILED:`);
    if (error instanceof SquarespaceError) {
      console.error({
        code: error.code,
        message: error.message,
        httpStatus: error.httpStatus,
        requestId: error.requestId,
        retryable: error.retryable,
      });
    } else {
      console.error(error);
    }
    return false;
  }
}

async function main(): Promise<void> {
  // Sequential, not Promise.all — keeps output readable and avoids firing
  // both requests at once against the live API.
  const productsOk = await run("listProducts()", () => listProducts());
  const ordersOk = await run("listOrders()", () => listOrders());

  if (!productsOk || !ordersOk) {
    process.exitCode = 1;
  }
}

main();
