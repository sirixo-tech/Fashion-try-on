import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchSessionActivity, type SessionTiming } from "./session-activity";

describe("session expiry navigation", () => {
  const start = Date.parse("2026-11-28T09:00:00Z");
  let watcher: ReturnType<typeof watchSessionActivity> | undefined;
  const timing = (expiry = 1000, serverTime = 0): SessionTiming => ({
    serverTime: new Date(start + serverTime).toISOString(),
    reauthDueAt: new Date(start + 1000).toISOString(),
    hardExpiresAt: new Date(start + 10000).toISOString(),
    expiresAt: new Date(start + expiry).toISOString(),
    idleTimeoutSeconds: 1,
  });
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(start);
  });
  afterEach(() => {
    watcher?.stop();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("revalidates at the deadline and ends an expired/offline session without a click", async () => {
    const expire = vi.fn();
    const request = vi.fn().mockRejectedValue(new Error("offline"));
    watcher = watchSessionActivity(timing(), request, expire);
    await vi.advanceTimersByTimeAsync(999);
    expect(expire).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(request).toHaveBeenCalledWith(false);
    expect(expire).toHaveBeenCalledOnce();
  });
  it("keeps active sessions when the server reports activity in another tab", async () => {
    const expire = vi.fn();
    const request = vi.fn().mockResolvedValue(timing(5000, 1000));
    watcher = watchSessionActivity(timing(), request, expire);
    await vi.advanceTimersByTimeAsync(1000);
    expect(expire).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(3000);
    expect(request).toHaveBeenCalledOnce();
  });
  it("does not count background focus, refresh updates or synthetic events as activity", async () => {
    const request = vi.fn().mockResolvedValue(timing(5000, 0));
    watcher = watchSessionActivity(timing(), request, vi.fn());
    document.dispatchEvent(new Event("pointerdown"));
    watcher.update(timing(5000));
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(request.mock.calls.every(([activity]) => activity === false)).toBe(
      true,
    );
  });
  it("accounts for client clock offset and cancels checks on teardown", async () => {
    vi.setSystemTime(start + 3600000);
    const request = vi.fn().mockRejectedValue(new Error("expired"));
    const expire = vi.fn();
    watcher = watchSessionActivity(timing(), request, expire);
    await vi.advanceTimersByTimeAsync(999);
    expect(expire).not.toHaveBeenCalled();
    watcher.stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(request).not.toHaveBeenCalled();
  });

  it("revalidates sibling-tab activity only for the same session", async () => {
    let receive!: (event: { data: unknown }) => void;
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        addEventListener(_name: string, listener: typeof receive) {
          receive = listener;
        }
        postMessage() {}
        close() {}
      },
    );
    const request = vi.fn().mockResolvedValue(timing(5000));
    const expire = vi.fn();
    watcher = watchSessionActivity(
      { ...timing(), sessionId: "current" },
      request,
      expire,
    );
    receive({ data: { type: "activity", sessionId: "other" } });
    expect(request).not.toHaveBeenCalled();
    receive({
      data: { type: "activity", sessionId: "current", expiresAt: "2099-01-01" },
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(request).toHaveBeenCalledWith(false);
    expect(expire).not.toHaveBeenCalled();
  });

  it("immediately ends a server-revoked session even before the cached deadline", async () => {
    const request = vi.fn().mockRejectedValue({ status: 401 });
    const expire = vi.fn();
    watcher = watchSessionActivity(timing(10000), request, expire);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(expire).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20000);
    expect(expire).toHaveBeenCalledOnce();
  });
});
