import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
  sessions: vi.fn(),
}));
vi.mock("../shopify.server", () => ({ authenticate: { webhook: mocks.auth } }));
vi.mock("../db.server", () => ({
  default: {
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({
        selfxConnection: { findUnique: mocks.find, updateMany: mocks.update },
        session: { deleteMany: mocks.sessions },
      }),
  },
}));
import { action } from "./webhooks.app.uninstalled";
describe("local Shopify uninstall recovery", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({
      shop: "merchant.myshopify.com",
      session: {},
      topic: "APP_UNINSTALLED",
    });
    mocks.update.mockResolvedValue({ count: 1 });
  });
  function run() {
    return action({
      request: new Request("https://app.test/webhook", {
        method: "POST",
        headers: { "x-shopify-triggered-at": "2026-11-20T00:00:00Z" },
      }),
    } as never);
  }
  it("revokes authorization but preserves the approved Store and preferences", async () => {
    mocks.find.mockResolvedValue({
      linkedAt: new Date("2026-11-19"),
      updatedAt: new Date(),
      selfxStoreId: "approved-store",
    });
    expect((await run()).status).toBe(200);
    const data = mocks.update.mock.calls[0][0].data;
    expect(data).toMatchObject({
      status: "NOT_CONNECTED",
      integrationTokenCiphertext: null,
      pendingLinkTokenCiphertext: null,
    });
    expect(data).not.toHaveProperty("selfxStoreId");
    expect(data).not.toHaveProperty("productVisibilityRules");
    expect(mocks.sessions).toHaveBeenCalled();
  });
  it("ignores an old uninstall after the merchant reconnects", async () => {
    mocks.find.mockResolvedValue({ linkedAt: new Date("2026-11-21") });
    await run();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sessions).not.toHaveBeenCalled();
  });
});
