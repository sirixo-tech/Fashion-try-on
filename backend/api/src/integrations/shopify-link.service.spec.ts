import {
  IntegrationCredentialStatus,
  IntegrationStatus,
  OrganizationStatus,
} from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { hashIntegrationToken } from "./integrations.service.js";
import {
  SHOPIFY_LINK_ERROR_CODES,
  ShopifyLinkService,
} from "./shopify-link.service.js";

describe("ShopifyLinkService", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates an expiring session without storing its raw link token", async () => {
    configure();
    const prisma = new FakePrisma();
    const service = new ShopifyLinkService(prisma as never);

    const created = await service.create({
      shopDomain: " Merchant-Store.MyShopify.com ",
      externalAccountId: "gid://shopify/Shop/1001",
      externalAccountName: "Merchant Store",
    });

    expect(created.linkToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.approvalUrl).toBe(
      `https://app.selfx.test/app/integrations/shopify/link?token=${created.linkToken}`,
    );
    expect(prisma.sessions[0]).toMatchObject({
      shopDomain: "merchant-store.myshopify.com",
      externalAccountId: "gid://shopify/Shop/1001",
    });
    expect(JSON.stringify(prisma.sessions[0])).not.toContain(created.linkToken);
  });

  it("describes a pending link without exposing its Shopify account ID", async () => {
    configure();
    const prisma = new FakePrisma();
    const service = new ShopifyLinkService(prisma as never);
    const input = shop();
    const created = await service.create(input);

    const details = await service.describe(created.linkToken);

    expect(details).toMatchObject({
      status: "PENDING",
      shopDomain: input.shopDomain,
      externalAccountName: input.externalAccountName,
    });
    expect(details).not.toHaveProperty("externalAccountId");
  });

  it("approves one Store and redeems exactly one catalog credential", async () => {
    configure();
    const prisma = new FakePrisma();
    const service = new ShopifyLinkService(prisma as never);
    const created = await service.create(shop());

    const approved = await service.approve(
      "user-1",
      created.linkToken,
      "store-1",
    );
    const redeemed = await service.redeem(created.linkToken);

    expect(approved).toMatchObject({
      status: "APPROVED",
      storeId: "store-1",
      shopDomain: "merchant.myshopify.com",
    });
    expect(redeemed).toMatchObject({
      status: "LINKED",
      storeId: "store-1",
      shopDomain: "merchant.myshopify.com",
    });
    expect(redeemed.integrationToken).toMatch(/^selfx_shopify_/);
    expect(prisma.credentials[0]).toMatchObject({
      scopes: ["catalog:sync"],
      status: IntegrationCredentialStatus.ACTIVE,
    });
    expect(prisma.credentials[0]?.tokenHash).toBe(
      hashIntegrationToken(redeemed.integrationToken),
    );
    expect(JSON.stringify(prisma.auditLogs)).not.toContain(
      redeemed.integrationToken,
    );
    await expect(service.redeem(created.linkToken)).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: SHOPIFY_LINK_ERROR_CODES.redeemed,
        }),
      }),
    });
  });

  it("does not let a Shopify shop cross Store boundaries", async () => {
    configure();
    const prisma = new FakePrisma();
    prisma.integrations.push(integration("store-2"));
    const service = new ShopifyLinkService(prisma as never);
    const created = await service.create(shop());

    await expect(
      service.approve("user-1", created.linkToken, "store-1"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: SHOPIFY_LINK_ERROR_CODES.shopAlreadyLinked,
        }),
      }),
    });
    expect(prisma.sessions[0]?.approvedAt).toBeNull();
  });

  it("rejects expired link sessions", async () => {
    configure();
    const prisma = new FakePrisma();
    const service = new ShopifyLinkService(prisma as never);
    const created = await service.create(shop());
    prisma.sessions[0]!.expiresAt = new Date(Date.now() - 1);

    await expect(
      service.approve("user-1", created.linkToken, "store-1"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: SHOPIFY_LINK_ERROR_CODES.expired,
        }),
      }),
    });
  });
});

function configure() {
  vi.stubEnv(
    "SELFX_SHOPIFY_APP_SERVICE_TOKEN",
    "shopify-service-token-with-at-least-32-characters",
  );
  vi.stubEnv("SELFX_WEB_BASE_URL", "https://app.selfx.test");
}

function shop() {
  return {
    shopDomain: "merchant.myshopify.com",
    externalAccountId: "gid://shopify/Shop/1001",
    externalAccountName: "Merchant Store",
  };
}

function integration(organizationId: string) {
  const now = new Date();
  return {
    id: `integration-${organizationId}`,
    organizationId,
    type: "SHOPIFY",
    status: IntegrationStatus.ACTIVE,
    externalAccountId: "gid://shopify/Shop/1001",
    externalAccountName: "Merchant Store",
    metadata: { shopDomain: "merchant.myshopify.com" },
    connectedAt: now,
    disconnectedAt: null,
    createdByUserId: "user-1",
    createdAt: now,
    updatedAt: now,
  };
}

type LinkSession = {
  id: string;
  tokenHash: string;
  shopDomain: string;
  externalAccountId: string;
  externalAccountName: string | null;
  organizationId: string | null;
  approvedByUserId: string | null;
  integrationId: string | null;
  expiresAt: Date;
  approvedAt: Date | null;
  redeemedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

class FakePrisma {
  sessions: LinkSession[] = [];
  integrations: ReturnType<typeof integration>[] = [];
  credentials: Array<Record<string, unknown>> = [];
  auditLogs: Array<Record<string, unknown>> = [];
  stores = [
    { id: "store-1", name: "Store One", status: OrganizationStatus.ACTIVE },
    { id: "store-2", name: "Store Two", status: OrganizationStatus.ACTIVE },
  ];

  organization = {
    findFirst: vi.fn(
      ({ where }: { where: { id: string; status: string } }) =>
        this.stores.find(
          (store) => store.id === where.id && store.status === where.status,
        ) ?? null,
    ),
  };

  shopifyLinkSession = {
    deleteMany: vi.fn(({ where }: { where: { expiresAt: { lt: Date } } }) => {
      this.sessions = this.sessions.filter(
        (session) => session.expiresAt >= where.expiresAt.lt,
      );
      return { count: 0 };
    }),
    create: vi.fn(({ data }: { data: Partial<LinkSession> }) => {
      const now = new Date();
      const session = {
        organizationId: null,
        approvedByUserId: null,
        integrationId: null,
        approvedAt: null,
        redeemedAt: null,
        createdAt: now,
        updatedAt: now,
        externalAccountName: null,
        ...data,
      } as LinkSession;
      this.sessions.push(session);
      return session;
    }),
    findUnique: vi.fn(({ where }: { where: { tokenHash?: string } }) => {
      const session = this.sessions.find(
        (item) => item.tokenHash === where.tokenHash,
      );
      return session ? this.withOrganization(session) : null;
    }),
    findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) => {
      const session = this.sessions.find((item) => item.id === where.id);
      if (!session) throw new Error("missing session");
      return this.withOrganization(session);
    }),
    updateMany: vi.fn(
      ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Partial<LinkSession>;
      }) => {
        const session = this.sessions.find((item) => item.id === where.id);
        if (!session) return { count: 0 };
        if (where.approvedAt === null && session.approvedAt)
          return { count: 0 };
        if (where.redeemedAt === null && session.redeemedAt)
          return { count: 0 };
        Object.assign(session, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    ),
    update: vi.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<LinkSession>;
      }) => {
        const session = this.sessions.find((item) => item.id === where.id)!;
        Object.assign(session, data, { updatedAt: new Date() });
        return session;
      },
    ),
  };

  integration = {
    findFirst: vi.fn(
      ({ where }: { where: Record<string, unknown> }) =>
        this.integrations.find((item) => {
          if (where.externalAccountId) {
            return item.externalAccountId === where.externalAccountId;
          }
          const metadata = where.metadata as { equals?: string } | undefined;
          return metadata?.equals === item.metadata.shopDomain;
        }) ?? null,
    ),
    findUnique: vi.fn(
      ({
        where,
      }: {
        where: { organizationId_type: { organizationId: string } };
      }) =>
        this.integrations.find(
          (item) =>
            item.organizationId === where.organizationId_type.organizationId,
        ) ?? null,
    ),
    create: vi.fn(({ data }: { data: ReturnType<typeof integration> }) => {
      const created = { ...integration(data.organizationId), ...data };
      this.integrations.push(created);
      return created;
    }),
    update: vi.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const current = this.integrations.find((item) => item.id === where.id)!;
        Object.assign(current, data, { updatedAt: new Date() });
        return current;
      },
    ),
  };

  integrationProviderCredential = { deleteMany: vi.fn(() => ({ count: 0 })) };
  integrationOauthState = { deleteMany: vi.fn(() => ({ count: 0 })) };
  integrationCredential = {
    updateMany: vi.fn(() => ({ count: 0 })),
    create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      this.credentials.push(data);
      return data;
    }),
  };
  auditLog = {
    create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      this.auditLogs.push(data);
      return data;
    }),
  };

  $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }

  private withOrganization(session: LinkSession) {
    const organization = this.stores.find(
      (store) => store.id === session.organizationId,
    );
    return {
      ...session,
      organization: organization ? { name: organization.name } : null,
    };
  }
}
