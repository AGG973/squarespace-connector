/**
 * Manual, one-off verification against the REAL live Squarespace API — not
 * part of the automated test suite, which is fully mocked. Run with
 * `npm run check` (loads `.env` via --env-file-if-exists, same as `npm test`).
 */

import { testConnection } from "./connector.ts";
import { SquarespaceError } from "./client.ts";

async function main(): Promise<void> {
  const result = await testConnection();

  if (result.success) {
    console.log("[check-connection] OK — reached the Squarespace API with the configured key.");
    return;
  }

  console.error("[check-connection] FAILED — could not reach the Squarespace API.");

  const { error } = result;
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

  process.exitCode = 1;
}

main();
