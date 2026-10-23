import { beforeEach, describe, expect, it, vi } from "vitest";

const connection = vi.hoisted(() => ({
  authenticate: vi.fn(),
  connect: vi.fn(),
  complete: vi.fn(),
  restart: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("./shopify.server", () => ({
  authenticate: { admin: connection.authenticate },
}));
vi.mock("./selfx-connection.server", () => ({
  startSelfxConnection: connection.connect,
  completeSelfxConnection: connection.complete,
  restartSelfxConnection: connection.restart,
  runSelfxCatalogSync: connection.sync,
}));

import { action } from "./routes/app._index";

const shop = "selfx-test-store.myshopify.com";

function connectionRequest(intent: string): Request {
  return new Request("https://example.test/app", {
    method: "POST",
    body: new URLSearchParams({ intent }),
  });
}

describe("Shopify connection actions on the embedded app page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    connection.authenticate.mockResolvedValue({
      session: { shop, accessToken: "shopify-token" },
    });
  });

  it.each([
    ["connection:connect", connection.connect],
    ["connection:complete", connection.complete],
    ["connection:restart", connection.restart],
    ["connection:sync", connection.sync],
  ])("runs %s for the authenticated shop", async (intent, operation) => {
    const result = await action({ request: connectionRequest(intent) } as Parameters<typeof action>[0]);

    expect(operation).toHaveBeenCalledExactlyOnceWith({
      shop,
      shopifyAccessToken: "shopify-token",
    });
    expect(result).toMatchObject({ connectionActionError: null });
  });

  it("rejects reconnect when the Shopify session has no access token", async () => {
    connection.authenticate.mockResolvedValue({
      session: { shop, accessToken: "" },
    });

    const result = await action({ request: connectionRequest("connection:restart") } as Parameters<typeof action>[0]);

    expect(connection.restart).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      connectionActionError: "The SelfX connection could not be completed. Try again.",
    });
  });
});
