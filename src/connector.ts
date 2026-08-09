import { squarespaceRequest } from "./client.ts";

export type TestConnectionResult =
  | { success: true }
  | { success: false; error: unknown };

/**
 * Verifies that the configured API key can reach the Squarespace API.
 *
 * Squarespace documents no dedicated "site info" endpoint, so this uses the
 * cheapest confirmed-working read: a single product.
 *
 * Never throws — connection failures are returned, not raised.
 */
export async function testConnection(): Promise<TestConnectionResult> {
  try {
    await squarespaceRequest("/products?limit=1");
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}
