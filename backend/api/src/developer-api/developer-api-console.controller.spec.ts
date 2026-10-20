import { describe, expect, it, vi } from "vitest";
import { ApiErrorException } from "../common/api-error.exception.js";
import { DeveloperApiConsoleController } from "./developer-api-console.controller.js";
const request = { headers: { authorization: "Bearer fixture" } } as never;
function setup(permissions: string[] = []) {
  const console = {
    usageSummary: vi.fn().mockResolvedValue({}),
    listWebhookEndpoints: vi.fn().mockResolvedValue({ data: [] }),
    listWebhookDeliveries: vi.fn().mockResolvedValue({ data: [] }),
    storeIdForWebhookEndpoint: vi.fn().mockResolvedValue("store-a"),
    credentialForStore: vi.fn().mockResolvedValue({ storeId: "store-a" }),
    webhookEndpoint: vi.fn().mockResolvedValue({ id: "endpoint" }),
  };
  const keys = { storeIdForKey: vi.fn().mockResolvedValue("store-a") };
  const webhooks = {
    createEndpoint: vi
      .fn()
      .mockResolvedValue({ id: "endpoint", secret: "fixture" }),
    updateEndpoint: vi.fn(),
    disableEndpoint: vi.fn(),
  };
  const platform = {
    hasPermission: vi.fn(async (_: string, code: string) =>
      permissions.includes(code),
    ),
    requirePermission: vi
      .fn()
      .mockRejectedValue(
        new ApiErrorException(
          403,
          "PLATFORM_PERMISSION_DENIED",
          "Permission denied.",
        ),
      ),
  };
  return {
    console,
    keys,
    webhooks,
    controller: new DeveloperApiConsoleController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "actor" }),
      } as never,
      platform as never,
      keys as never,
      console as never,
      webhooks as never,
    ),
  };
}
const reads = [
  (c: DeveloperApiConsoleController) =>
    c.usage(request, { storeId: "store-a", apiKeyId: "key" }),
  (c: DeveloperApiConsoleController) =>
    c.listWebhooks(request, { storeId: "store-a" }),
  (c: DeveloperApiConsoleController) =>
    c.listWebhookDeliveries(request, {
      endpointId: "endpoint",
      storeId: "store-a",
    }),
];
const writes = [
  (c: DeveloperApiConsoleController) =>
    c.createWebhook(request, {
      storeId: "store-a",
      url: "https://example.test/events",
      subscribedEvents: ["try_on.completed"],
    }),
  (c: DeveloperApiConsoleController) =>
    c.updateWebhook(request, "endpoint", {
      url: "https://example.test/events",
    }),
  (c: DeveloperApiConsoleController) => c.disableWebhook(request, "endpoint"),
];
describe("Platform-only Developer console", () => {
  it.each([...reads, ...writes].map((invoke, index) => ({ invoke, index })))(
    "rejects Store operation $index before any resource lookup",
    async ({ invoke }) => {
      const c = setup();
      await expect(invoke(c.controller)).rejects.toMatchObject({
        response: { error: { code: "PLATFORM_PERMISSION_DENIED" } },
      });
      for (const fn of [
        ...Object.values(c.console),
        ...Object.values(c.keys),
        ...Object.values(c.webhooks),
      ])
        expect(fn).not.toHaveBeenCalled();
    },
  );
  it("lets Platform viewers read while enforcing manage for writes", async () => {
    const c = setup(["DEVELOPER_API_VIEW"]);
    for (const read of reads) await read(c.controller);
    for (const write of writes)
      await expect(write(c.controller)).rejects.toThrow();
    expect(c.webhooks.createEndpoint).not.toHaveBeenCalled();
  });
  it("lets Platform managers maintain Store-scoped webhooks", async () => {
    const c = setup(["DEVELOPER_API_MANAGE"]);
    for (const write of writes) await write(c.controller);
    expect(c.console.credentialForStore).toHaveBeenCalledWith("store-a");
    expect(c.webhooks.updateEndpoint).toHaveBeenCalledWith(
      { storeId: "store-a" },
      "endpoint",
      { url: "https://example.test/events" },
    );
  });
  it("rejects filters mixing Stores even for Platform viewers", async () => {
    const c = setup(["DEVELOPER_API_VIEW"]);
    await expect(
      c.controller.usage(request, { storeId: "other", apiKeyId: "key" }),
    ).rejects.toMatchObject({
      response: { error: { code: "DEVELOPER_API_SCOPE_MISMATCH" } },
    });
    await expect(
      c.controller.listWebhookDeliveries(request, {
        storeId: "other",
        endpointId: "endpoint",
      }),
    ).rejects.toThrow();
    expect(c.console.usageSummary).not.toHaveBeenCalled();
    expect(c.console.listWebhookDeliveries).not.toHaveBeenCalled();
  });
});
