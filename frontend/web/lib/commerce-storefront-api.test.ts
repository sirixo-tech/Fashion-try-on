import { expect, it, vi, beforeEach, afterEach } from "vitest";
import { selfxApi } from "./api";
import {
  uploadShopifyTryOnPersonImage,
  createShopifyTryOnRun,
  getShopifyTryOnSession,
} from "./shopify-storefront-try-on-api";
vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  selfxApi: vi.fn(),
}));
beforeEach(() => vi.resetAllMocks());
afterEach(() => vi.unstubAllGlobals());
it("binds on the SelfX origin before reading the session and deduplicates concurrent bootstrap", async () => {
  let release!: (value: Response) => void;
  const fetchImpl = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetchImpl);
  const first = getShopifyTryOnSession("s".repeat(43));
  const second = getShopifyTryOnSession("s".repeat(43));
  expect(selfxApi).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(fetchImpl).toHaveBeenCalledWith(
    "/try-on/commerce/visitor",
    expect.objectContaining({
      credentials: "same-origin",
      body: JSON.stringify({ session: "s".repeat(43) }),
    }),
  );
  release(Response.json({ bound: true }));
  await Promise.all([first, second]);
  expect(selfxApi).toHaveBeenCalledTimes(2);
});
it("does not load a session if visitor binding is rejected", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json(
        {
          error: {
            code: "STOREFRONT_VISITOR_MISMATCH",
            message: "Relaunch Try-On.",
          },
        },
        { status: 409 },
      ),
    ),
  );
  await expect(getShopifyTryOnSession("s".repeat(43))).rejects.toMatchObject({
    code: "STOREFRONT_VISITOR_MISMATCH",
  });
  expect(selfxApi).not.toHaveBeenCalled();
});
it("records accepted consent before uploading binary photo data", async () => {
  vi.mocked(selfxApi).mockResolvedValue({});
  await uploadShopifyTryOnPersonImage(
    "session",
    new File(["image"], "person.png", { type: "image/png" }),
  );
  const calls = vi.mocked(selfxApi).mock.calls;
  expect(calls[0]?.[0]).toContain("/commerce/try-on-sessions/session/consent");
  expect(JSON.parse(calls[0]![1]!.body as string)).toEqual({
    accepted: true,
    policyVersion: "selfx-photo-2026-10-23",
  });
  expect(calls[1]?.[1]?.body).toBeInstanceOf(FormData);
});
it("does not upload when consent recording fails", async () => {
  vi.mocked(selfxApi).mockRejectedValue(new Error("consent failed"));
  await expect(
    uploadShopifyTryOnPersonImage("session", new File(["x"], "p.png")),
  ).rejects.toThrow();
  expect(selfxApi).toHaveBeenCalledTimes(1);
});
it("keeps the same generation idempotency key on an unchanged retry", async () => {
  vi.mocked(selfxApi).mockResolvedValue({});
  await createShopifyTryOnRun("session", "request-id");
  await createShopifyTryOnRun("session", "request-id");
  expect(
    vi
      .mocked(selfxApi)
      .mock.calls.map((call) => JSON.parse(call[1]!.body as string)),
  ).toEqual([
    { clientRequestId: "request-id" },
    { clientRequestId: "request-id" },
  ]);
});
