import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import { getContact } from "../src/actions/get-contact";

const CONTACT_ID = "00000000-0000-0000-0000-000000000000";

/**
 * Shape CONFIRMED live, 2026-08-11, against one real contact (values below
 * are placeholders, not the real captured values). Wrapped in a top-level
 * `contact` key, with primaryEmail.{email, acceptsMarketing} rather than
 * the earlier (wrong) flat email/transactionalEmailStatus/address model.
 */
const contactResponse = {
  contact: {
    id: CONTACT_ID,
    createdOn: "2026-01-01T00:00:00.000Z",
    firstName: "Placeholder",
    lastName: "",
    locale: null,
    primaryEmail: {
      email: "placeholder@example.com",
      createdOn: "2026-01-01T00:00:00.000Z",
      acceptsMarketing: {
        acceptsMarketing: true,
        joinedOn: "2026-01-01T00:00:00.000Z",
        leftOn: null,
      },
    },
    defaultShippingAddress: null,
  },
};

beforeEach(() => {
  mockRequest.mockReset();
  // Safety net: if the client mock ever stops intercepting, fail loudly here
  // rather than silently issuing real requests against the live Squarespace API.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected real network call in tests");
    }),
  );
});

describe("getContact — client-side validation", () => {
  it("rejects a missing id before any request is sent", async () => {
    await expect(getContact(undefined as never)).rejects.toThrow(/id is required/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });

  it("rejects an empty-string id before any request is sent", async () => {
    await expect(getContact({ id: "" })).rejects.toThrow(/id is required/i);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});

describe("getContact — request path (this is where resolveUrl()'s /contacts dedup matters)", () => {
  it("resolves to exactly /contacts/{id} — not doubled, not the bare collection root", async () => {
    mockRequest.mockResolvedValue(contactResponse);

    await getContact({ id: CONTACT_ID });

    // squarespaceRequest is mocked here, so this only proves *our* action
    // builds the right path — it does not by itself prove client.ts's real
    // resolveUrl() maps this path to https://api.squarespace.com/v1/contacts/{id}
    // without doubling the /contacts segment. That dedup logic is exercised
    // for real (unmocked) for the first time only against the live API.
    expect(mockRequest).toHaveBeenCalledWith(`/contacts/${CONTACT_ID}`);
    expect(mockRequest).not.toHaveBeenCalledWith(`/contacts/contacts/${CONTACT_ID}`);
    expect(mockRequest).not.toHaveBeenCalledWith("/contacts");
  });

  it("URL-encodes the id in the path", async () => {
    mockRequest.mockResolvedValue(contactResponse);

    await getContact({ id: "weird id/with slash" });

    expect(mockRequest).toHaveBeenCalledWith("/contacts/weird%20id%2Fwith%20slash");
  });
});

describe("getContact — successful response", () => {
  it("returns the mocked contact as-is", async () => {
    mockRequest.mockResolvedValue(contactResponse);

    const result = await getContact({ id: CONTACT_ID });

    expect(result).toEqual(contactResponse);
  });
});
