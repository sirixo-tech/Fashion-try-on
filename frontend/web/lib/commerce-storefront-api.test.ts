import { expect, it, vi, beforeEach } from "vitest";
import { selfxApi } from "./api";
import {
  uploadShopifyTryOnPersonImage,
  createShopifyTryOnRun,
} from "./shopify-storefront-try-on-api";
vi.mock("./api", () => ({ selfxApi: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
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
