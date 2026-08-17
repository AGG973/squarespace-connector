import { beforeEach, describe, expect, it, vi } from "vitest";

import { ACTION_IDS, ConnectorError, execute, listActions } from "../src/connector";

beforeEach(() => {
  // Safety net: neither test below should ever reach the network, but stub
  // fetch anyway so a regression fails loudly instead of hitting the live
  // Squarespace API (same pattern as every other test file in this suite).
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected real network call in tests");
    }),
  );
});

describe("listActions", () => {
  it("returns all 5 declared action IDs, each flagged as implemented", () => {
    const actions = listActions();

    expect(actions).toHaveLength(5);
    expect(actions.map((a) => a.actionId).sort()).toEqual([...ACTION_IDS].sort());
    expect(actions.every((a) => a.implemented)).toBe(true);
  });
});

describe("execute — UNKNOWN_ACTION path", () => {
  it("rejects a made-up actionId with a ConnectorError, not a crash", async () => {
    await expect(execute({ actionId: "squarespace.does_not_exist" })).rejects.toBeInstanceOf(
      ConnectorError,
    );
  });

  it("carries the UNKNOWN_ACTION code and mentions the bad actionId in the message", async () => {
    await expect(execute({ actionId: "squarespace.does_not_exist" })).rejects.toMatchObject({
      code: "UNKNOWN_ACTION",
      message: expect.stringContaining("squarespace.does_not_exist"),
    });
  });
});
