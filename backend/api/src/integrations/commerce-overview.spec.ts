import { describe, expect, it, vi } from "vitest";
import { commerceOverview } from "./commerce-overview.js";

function database(
  metadata: unknown = {
    shopDomain: "demo.myshopify.com",
    lastCatalogSyncStatus: "COMPLETED",
    lastCatalogSyncAt: "2026-10-25T00:00:00Z",
  },
) {
  return {
    integration: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi
        .fn()
        .mockResolvedValue([
          {
            id: "shopify",
            organizationId: "store",
            externalAccountId: "gid://shopify/Shop/123",
            externalAccountName: "Demo",
            metadata,
            status: "ACTIVE",
            organization: { name: "Demo Store", status: "ACTIVE" },
            credentials: [{ id: "private" }],
          },
        ]),
    },
    externalProductMapping: {
      groupBy: vi
        .fn()
        .mockResolvedValue([{ integrationId: "shopify", _count: { _all: 8 } }]),
    },
    billableGeneration: {
      count: vi.fn().mockResolvedValue(6),
      groupBy: vi
        .fn()
        .mockResolvedValue([{ organizationId: "store", _count: { _all: 6 } }]),
    },
  };
}

describe("Shopify monitoring", () => {
  it("uses only Shopify integration/channel data, searchable shop domains and successful receipts", async () => {
    const db = database();
    const result = await commerceOverview(
      db as never,
      { search: "DEMO", page: 2, pageSize: 20 },
      "SHOPIFY",
    );
    const query = db.integration.findMany.mock.calls[0]![0] as unknown;
    expect(query).toMatchObject({
      skip: 20,
      take: 20,
      where: {
        AND: [
          expect.objectContaining({
            type: "SHOPIFY",
            OR: expect.arrayContaining([
              { metadata: { path: ["shopDomain"], string_contains: "demo" } },
            ]),
          }),
          {},
        ],
      },
    });
    expect(db.billableGeneration.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        channel: "SHOPIFY",
        completedAt: { gte: expect.any(Date), lt: expect.any(Date) },
      }),
    });
    expect(result.data[0]).toMatchObject({
      website: "https://demo.myshopify.com",
      successfulTryOns: 6,
      productCount: 8,
      lastCatalogSyncAt: "2026-10-25T00:00:00.000Z",
    });
    expect(JSON.stringify(result)).not.toMatch(/gid:\/\/|private/);
  });

  it.each(["FAILED", "RUNNING", undefined])(
    "does not label a %s attempt as a completed sync",
    async (status) => {
      const result = await commerceOverview(
        database({
          lastCatalogSyncStatus: status,
          lastCatalogSyncAt: "2026-10-25T00:00:00Z",
          shopDomain: "demo.myshopify.com",
        }) as never,
        {},
        "SHOPIFY",
      );
      expect(result.data[0]!.lastCatalogSyncAt).toBeNull();
    },
  );

  it.each([
    "javascript:alert(1)",
    "https://other.example",
    "demo.myshopify.com.attacker.test",
    "gid://shopify/Shop/123",
  ])("never links an invalid shop domain %s", async (shopDomain) => {
    const result = await commerceOverview(
      database({ shopDomain }) as never,
      {},
      "SHOPIFY",
    );
    expect(result.data[0]!.website).toBeNull();
  });
});
