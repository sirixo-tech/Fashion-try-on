import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { WooCommerceOverviewQueryDto } from "./dto/woocommerce-overview.dto.js";
import {
  catalogSyncReceipt,
  wooCommerceOverview,
} from "./woocommerce-overview.js";

function database() {
  return {
    integration: {
      count: vi.fn().mockResolvedValue(25),
      findMany: vi
        .fn()
        .mockResolvedValue([
          {
            id: "woo",
            organizationId: "store",
            externalAccountId: "https://example.test",
            externalAccountName: "Website",
            status: "ACTIVE",
            metadata: {
              lastCatalogSyncAt: "2026-10-24T12:00:00Z",
              secret: "private",
            },
            organization: { name: "Store", status: "ACTIVE" },
            credentials: [{ id: "private-credential" }],
          },
        ]),
    },
    externalProductMapping: {
      groupBy: vi
        .fn()
        .mockResolvedValue([{ integrationId: "woo", _count: { _all: 4 } }]),
    },
    billableGeneration: {
      count: vi.fn().mockResolvedValue(7),
      groupBy: vi
        .fn()
        .mockResolvedValue([{ organizationId: "store", _count: { _all: 7 } }]),
    },
  };
}

describe("WooCommerce monitoring", () => {
  it("uses paginated WooCommerce Stores, parent products and durable successful generations without returning credentials", async () => {
    const db = database();
    const result = await wooCommerceOverview(db as never, {
      page: 2,
      pageSize: 20,
      search: "store",
    });
    expect(db.integration.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 20,
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ type: "WOOCOMMERCE" }),
          ]),
        }),
      }),
    );
    expect(db.externalProductMapping.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          integrationId: { in: ["woo"] },
          status: "ACTIVE",
          externalVariantId: null,
          product: { active: true },
        },
      }),
    );
    expect(db.billableGeneration.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          channel: "WOOCOMMERCE",
          completedAt: { gte: expect.any(Date), lt: expect.any(Date) },
          organization: { integrations: { some: expect.any(Object) } },
        }),
      }),
    );
    expect(result.data[0]).toMatchObject({
      productCount: 4,
      successfulTryOns: 7,
      health: "CONNECTED",
      lastCatalogSyncAt: "2026-10-24T12:00:00.000Z",
    });
    expect(result.summary.successfulTryOns).toBe(7);
    expect(result.pagination).toMatchObject({
      total: 25,
      totalPages: 2,
      hasMore: false,
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });

  it("keeps every Store-specific query scoped and handles an empty page without querying mappings", async () => {
    const db = database();
    db.integration.findMany.mockResolvedValue([]);
    await wooCommerceOverview(db as never, {
      storeId: "selected-store",
      health: "NEEDS_ATTENTION",
    });
    for (const [call] of db.integration.count.mock.calls)
      expect(JSON.stringify(call)).toContain(
        '"organizationId":"selected-store"',
      );
    expect(db.externalProductMapping.groupBy).not.toHaveBeenCalled();
    expect(db.billableGeneration.groupBy).not.toHaveBeenCalled();
  });

  it("never substitutes connection metadata or malformed dates for a full-sync receipt", () => {
    expect(
      catalogSyncReceipt({ updatedAt: "2026-10-24T00:00:00Z" }),
    ).toBeNull();
    expect(catalogSyncReceipt({ lastCatalogSyncAt: "invalid" })).toBeNull();
    expect(catalogSyncReceipt(null)).toBeNull();
  });

  it.each([
    { pageSize: 101 },
    { page: -1 },
    { health: "ACTIVE" },
    { storeId: "other" },
    { search: "x".repeat(121) },
  ])("validates overview input %o", async (input) => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(input, {
        type: "query",
        metatype: WooCommerceOverviewQueryDto,
      }),
    ).rejects.toThrow();
  });
});
