/**
 * Auth-header construction for Squarespace API requests, per connector.yaml's
 * `auth` block (type: api_key, scheme: bearer, header: Authorization, format:
 * "Bearer {api_key}"). Extracted out of client.ts so the auth concern has its
 * own home, matching this project's intended file structure.
 */

export function buildAuthHeader(apiKey: string | undefined): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}` };
}
