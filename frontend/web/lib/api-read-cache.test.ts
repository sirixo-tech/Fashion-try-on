import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { selfxApi, setAuthSessionHooks } from "./api";
import { clearApiReadCache } from "./api-read-cache";

const path = "/api/v1/organizations/current-store";
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
beforeEach(() => {
  clearApiReadCache();
});
afterEach(() => {
  clearApiReadCache();
  setAuthSessionHooks(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("shares concurrent context reads and isolates tokens and Store permission routes", async () => {
  const fetch = vi.fn().mockImplementation(async () => json({ store: "A" }));
  vi.stubGlobal("fetch", fetch);
  await Promise.all([
    selfxApi(path, { accessToken: "alice" }),
    selfxApi(path, { accessToken: "alice" }),
  ]);
  await selfxApi(path, { accessToken: "alice" });
  expect(fetch).toHaveBeenCalledTimes(1);
  await selfxApi(path, { accessToken: "bob" });
  await selfxApi("/api/v1/admin/stores/a/effective-permissions", {
    accessToken: "alice",
  });
  await selfxApi("/api/v1/admin/stores/b/effective-permissions", {
    accessToken: "alice",
  });
  expect(fetch).toHaveBeenCalledTimes(4);
});

it("expires access context after 15 seconds and does not retain completed metrics", async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockImplementation(async () => json({}));
  vi.stubGlobal("fetch", fetch);
  await selfxApi(path, { accessToken: "alice" });
  vi.advanceTimersByTime(15_001);
  await selfxApi(path, { accessToken: "alice" });
  const metrics = "/api/v1/admin/usage/summary?range=30d";
  await Promise.all([
    selfxApi(metrics, { accessToken: "alice" }),
    selfxApi(metrics, { accessToken: "alice" }),
  ]);
  await selfxApi(metrics, { accessToken: "alice" });
  expect(fetch).toHaveBeenCalledTimes(4);
});

it("invalidates on access, Store, impersonation and focus changes and on writes", async () => {
  const fetch = vi.fn().mockImplementation(async () => json({}));
  vi.stubGlobal("fetch", fetch);
  await selfxApi(path, { accessToken: "alice" });
  for (const event of [
    "selfx:permissions-changed",
    "selfx:store-changed",
    "selfx:impersonation-changed",
    "focus",
  ]) {
    window.dispatchEvent(new Event(event));
    await selfxApi(path, { accessToken: "alice" });
  }
  await selfxApi("/api/v1/auth/logout", {
    method: "POST",
    accessToken: "alice",
  });
  await selfxApi(path, { accessToken: "alice" });
  expect(fetch).toHaveBeenCalledTimes(7);
});

it("does not repopulate the cache from an old in-flight response after invalidation", async () => {
  let finish!: (value: Response) => void;
  const fetch = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    )
    .mockImplementation(async () => json({ store: "B" }));
  vi.stubGlobal("fetch", fetch);
  const old = selfxApi(path, { accessToken: "alice" });
  window.dispatchEvent(new Event("selfx:impersonation-changed"));
  expect(await selfxApi(path, { accessToken: "alice" })).toEqual({
    store: "B",
  });
  finish(json({ store: "A" }));
  await old;
  expect(await selfxApi(path, { accessToken: "alice" })).toEqual({
    store: "B",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("never caches failed reads and clears access context on authorization denial", async () => {
  const fetch = vi
    .fn()
    .mockImplementationOnce(async () =>
      json({ error: { code: "DENIED" } }, 403),
    )
    .mockImplementation(async () => json({}));
  vi.stubGlobal("fetch", fetch);
  await expect(selfxApi(path, { accessToken: "alice" })).rejects.toMatchObject({
    status: 403,
  });
  await selfxApi(path, { accessToken: "alice" });
  fetch.mockImplementationOnce(async () =>
    json({ error: { code: "DENIED" } }, 403),
  );
  await expect(
    selfxApi("/api/v1/admin/stores/a/products", { accessToken: "alice" }),
  ).rejects.toMatchObject({ status: 403 });
  await selfxApi(path, { accessToken: "alice" });
  expect(fetch).toHaveBeenCalledTimes(4);
});
