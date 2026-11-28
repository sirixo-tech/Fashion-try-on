import { describe, expect, it } from "vitest";
import { loadSessionPolicy, sessionTiming } from "./session-policy.js";

describe("human session policy", () => {
  const start = new Date("2026-11-28T09:00:00Z");
  const credentialExpiry = new Date(start.getTime() + 30 * 86400000);
  const at = (hours: number) => new Date(start.getTime() + hours * 3600000);
  const policy = loadSessionPolicy({});
  const deadline = (activity: Date | null) =>
    new Date(
      sessionTiming(policy, start, activity, credentialExpiry).expiresAt,
    );

  it("allows the first 24 hours even when idle", () => {
    expect(deadline(start)).toEqual(at(24));
  });
  it("allows work across 24 hours, then expires after 15 minutes idle", () => {
    expect(deadline(at(24.5))).toEqual(at(24.75));
  });
  it("ends at 30 hours even with activity at the last minute", () => {
    expect(deadline(at(29.99))).toEqual(at(30));
  });
  it("requires legacy sessions to log in and respects shorter credential lifetimes", () => {
    expect(deadline(null).getTime()).toBe(0);
    expect(
      new Date(sessionTiming(policy, start, at(25), at(26)).expiresAt),
    ).toEqual(at(25.25));
    expect(
      new Date(sessionTiming(policy, start, at(25), at(25.1)).expiresAt),
    ).toEqual(at(25.1));
  });
  it("loads all three timings from env and rejects invalid policies", () => {
    expect(
      loadSessionPolicy({
        AUTH_SESSION_REAUTH_AFTER_SECONDS: "60",
        AUTH_SESSION_IDLE_TIMEOUT_SECONDS: "10",
        AUTH_SESSION_HARD_MAX_SECONDS: "120",
      }),
    ).toEqual({
      reauthAfterSeconds: 60,
      idleTimeoutSeconds: 10,
      hardMaxSeconds: 120,
    });
    for (const value of ["", "0", "-1", "1.5", "NaN"])
      expect(() =>
        loadSessionPolicy({ AUTH_SESSION_IDLE_TIMEOUT_SECONDS: value }),
      ).toThrow();
    expect(() =>
      loadSessionPolicy({ AUTH_SESSION_HARD_MAX_SECONDS: "60" }),
    ).toThrow();
  });
});
