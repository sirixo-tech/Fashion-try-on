import { createHash } from "node:crypto";
import { IntegrationStatus, OrganizationStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublicCatalogImage } from "../catalog/catalog-url-policy.js";
import { WooCommerceLinkService } from "./woocommerce-link.service.js";

vi.mock("../catalog/catalog-url-policy.js", async (original) => ({
  ...(await original()),
  fetchPublicCatalogImage: vi.fn(),
}));

const linkToken = "a".repeat(43);
const redeemSecret = "b".repeat(43);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

describe("WooCommerceLinkService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SELFX_WEB_BASE_URL = "https://selfx.example";
    vi.mocked(fetchPublicCatalogImage).mockResolvedValue({
      buffer: Buffer.from(JSON.stringify({ siteUrl: "https://shop.example", adminUrl: "https://shop.example/wp-admin/admin.php?page=selfx-woocommerce&selfx_return=1", challenge: hash(linkToken) })),
      contentType: "application/json",
    });
  });

  it("verifies the plugin, approves an active Store and redeems only once", async () => {
    let session: Record<string, any> | null = null;
    const credentials: Array<Record<string, any>> = [];
    const prisma = {
      wooCommerceLinkSession: {
        findUnique: vi.fn(async () => session && { ...session, organization: session.organizationId ? { name: "New Store" } : null }),
        create: vi.fn(async ({ data }: { data: Record<string, any> }) => { session = { ...data, approvedAt: null, redeemedAt: null, organizationId: null, approvedByUserId: null }; }),
        updateMany: vi.fn(async ({ data }: { data: Record<string, any> }) => {
          if (!session || (data.approvedAt && session.approvedAt) || (data.redeemedAt && session.redeemedAt)) return { count: 0 };
          session = { ...session, ...data }; return { count: 1 };
        }),
        update: vi.fn(async () => ({})),
      },
      organization: {
        findFirst: vi.fn(async () => ({ id: "store-1" })),
      },
      integration: {
        findFirst: vi.fn(async () => null),
        findUnique: vi.fn(async () => null),
        upsert: vi.fn(async () => ({ id: "integration-1", status: IntegrationStatus.ACTIVE })),
      },
      integrationCredential: {
        updateMany: vi.fn(async () => ({ count: 0 })),
        create: vi.fn(async ({ data }: { data: Record<string, any> }) => { credentials.push(data); }),
      },
      auditLog: { create: vi.fn(async () => ({})) },
      $queryRaw: vi.fn(async () => [{ status: OrganizationStatus.ACTIVE, name: "New Store" }]),
      $transaction: vi.fn(async (work: (tx: any) => Promise<unknown>) => work(prisma)),
    };
    const service = new WooCommerceLinkService(prisma as never);
    const created = await service.create({ siteUrl: "https://shop.example", adminUrl: "https://shop.example/wp-admin/admin.php?page=selfx-woocommerce&selfx_return=1", linkToken, redeemSecret });
    expect(created.approvalUrl).toContain(`/woocommerce/link?token=${linkToken}`);
    expect(session).toMatchObject({ tokenHash: hash(linkToken), redeemSecretHash: hash(redeemSecret) });
    expect(JSON.stringify(session)).not.toContain(redeemSecret);
    expect(await service.approve("owner-1", linkToken, "store-1")).toMatchObject({ status: "APPROVED", storeId: "store-1" });
    await expect(service.redeem(linkToken, "c".repeat(43))).rejects.toMatchObject({ response: expect.anything() });
    const redeemed = await service.redeem(linkToken, redeemSecret);
    expect(redeemed).toMatchObject({ status: "LINKED", storeId: "store-1", integrationId: "integration-1" });
    expect(credentials).toHaveLength(1);
    expect(credentials[0]?.tokenHash).toBe(hash(redeemed.integrationToken));
    await expect(service.redeem(linkToken, redeemSecret)).rejects.toMatchObject({ response: expect.anything() });
    expect(credentials).toHaveLength(1);
  });

  it("rejects an admin return address outside the verified website", async () => {
    const prisma = { wooCommerceLinkSession: { create: vi.fn() } };
    const service = new WooCommerceLinkService(prisma as never);
    await expect(service.create({
      siteUrl: "https://shop.example",
      adminUrl: "https://elsewhere.example/wp-admin/admin.php?page=selfx-woocommerce&selfx_return=1",
      linkToken, redeemSecret,
    })).rejects.toMatchObject({ response: { error: { code: "WOOCOMMERCE_SITE_INVALID" } } });
    expect(prisma.wooCommerceLinkSession.create).not.toHaveBeenCalled();
    expect(fetchPublicCatalogImage).not.toHaveBeenCalled();
  });
});
