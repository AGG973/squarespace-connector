import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the spy identity is shared with the mock factory below, rather
// than relying on the imported binding being the same object.
const { mockRequest } = vi.hoisted(() => ({ mockRequest: vi.fn() }));

vi.mock("../src/client", () => ({
  squarespaceRequest: mockRequest,
}));

import { listContacts } from "../src/actions/list-contacts";

/**
 * The real, empty GET /contacts response — verbatim from fixtures/contacts.json,
 * captured 2026-08-11. This is the only real data point list_contacts itself has
 * produced; see src/schemas/list-contacts.schema.json's VERIFICATION STATUS.
 */
const emptyContactsResponse = {
  contacts: [],
  pagination: { nextPageUrl: null, nextPageCursor: null, hasNextPage: false },
};

/**
 * A populated response, built from the one real contact shape CONFIRMED live,
 * 2026-08-11, via get_contact (see fixtures/contact-by-id.json) — not itself
 * captured through list_contacts, since the live catalog had zero contacts.
 * Placed inside the `contacts` array/envelope shape, which IS confirmed
 * (via fixtures/contacts.json's empty-array envelope).
 */
const populatedContactsResponse = {
  contacts: [
    {
      id: "6a7afd9c3a715540f23e0a54",
      createdOn: "2026-08-11T10:46:52.880876Z",
      firstName: "Alya",
      lastName: "",
      locale: null,
      primaryEmail: {
        createdOn: "2026-08-11T10:46:52.880876Z",
        email: "buyer@example.com",
        acceptsMarketing: {
          acceptsMarketing: true,
          joinedOn: "2026-08-11T10:46:52.925359Z",
          leftOn: null,
        },
      },
      defaultShippingAddress: null,
    },
  ],
  pagination: {
    nextPageUrl: "https://api.squarespace.com/v1/contacts?cursor=abc123",
    nextPageCursor: "abc123",
    hasNextPage: true,
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

describe("listContacts", () => {
  it("returns the confirmed empty-catalog response as-is", async () => {
    mockRequest.mockResolvedValue(emptyContactsResponse);

    const result = await listContacts();

    expect(result.contacts).toEqual([]);
    expect(result.pagination).toEqual({
      nextPageCursor: null,
      nextPageUrl: null,
      hasNextPage: false,
    });
    expect(mockRequest).toHaveBeenCalledWith("/contacts");
  });

  it("returns the contacts array and pagination from a populated response", async () => {
    mockRequest.mockResolvedValue(populatedContactsResponse);

    const result = await listContacts();

    expect(result.contacts).toEqual(populatedContactsResponse.contacts);
    expect(result.pagination).toEqual({
      nextPageCursor: "abc123",
      nextPageUrl: "https://api.squarespace.com/v1/contacts?cursor=abc123",
      hasNextPage: true,
    });
  });

  it("passes cursor as a query param when provided", async () => {
    mockRequest.mockResolvedValue(emptyContactsResponse);

    await listContacts({ cursor: "abc123" });

    expect(mockRequest).toHaveBeenCalledWith("/contacts?cursor=abc123");
  });

  it("defaults pagination when the response omits it", async () => {
    mockRequest.mockResolvedValue({ contacts: [] });

    const result = await listContacts();

    expect(result.contacts).toEqual([]);
    expect(result.pagination).toEqual({
      nextPageCursor: null,
      nextPageUrl: null,
      hasNextPage: false,
    });
  });
});
