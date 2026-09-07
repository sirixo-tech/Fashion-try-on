import {
  IntegrationCredentialStatus,
  IntegrationStatus,
  IntegrationType,
  OrganizationStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  INTEGRATIONS_ERROR_CODES,
  IntegrationsService,
  hashIntegrationToken,
} from "./integrations.service.js";

describe("IntegrationsService", () => {
  it("registers a Store integration", async () => {
    const prisma = new FakePrisma();
    const service = new IntegrationsService(prisma as never);

    const integration = await service.upsertIntegration("user-1", {
      storeId: "store-1",
      type: "SHOPIFY",
      externalAccountId: "demo.myshopify.com",
      externalAccountName: "Demo Shop",
    });

    expect(integration).toMatchObject({
      storeId: "store-1",
      storeName: "Store One",
      type: "SHOPIFY",
      status: "ACTIVE",
      externalAccountId: "demo.myshopify.com",
      externalAccountName: "Demo Shop",
    });
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "INTEGRATION_CONNECTED",
      organizationId: "store-1",
      resourceType: "integration",
    });
  });

  it("rejects integration registration for inactive stores", async () => {
    const prisma = new FakePrisma({
      storeStatus: OrganizationStatus.SUSPENDED,
    });
    const service = new IntegrationsService(prisma as never);

    await expect(
      service.upsertIntegration("user-1", {
        storeId: "store-1",
        type: "WOOCOMMERCE",
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: INTEGRATIONS_ERROR_CODES.storeNotFound,
        }),
      }),
    });
  });

  it("creates a plugin credential and stores only its hash", async () => {
    const prisma = new FakePrisma();
    const service = new IntegrationsService(prisma as never);
    const integration = await service.upsertIntegration("user-1", {
      storeId: "store-1",
      type: "SHOPIFY",
    });

    const response = await service.createCredential("user-1", integration.id, {
      name: "Theme extension",
      scopes: ["catalog:sync", "tryon:create", "catalog:sync"],
    });

    expect(response.secret).toMatch(/^selfx_shopify_/);
    expect(response.credential).toMatchObject({
      integrationId: integration.id,
      name: "Theme extension",
      status: "ACTIVE",
      scopes: ["catalog:sync", "tryon:create"],
    });
    expect(response.credential).not.toHaveProperty("tokenHash");

    const stored = prisma.credentials[0]!;
    expect(stored.tokenPrefix).toBe(response.secret.slice(0, 32));
    expect(stored.tokenHash).toBe(hashIntegrationToken(response.secret));
    expect(JSON.stringify(prisma.auditLogs)).not.toContain(response.secret);
  });

  it("revokes credentials and rejects duplicate revocation", async () => {
    const prisma = new FakePrisma();
    const service = new IntegrationsService(prisma as never);
    const integration = await service.upsertIntegration("user-1", {
      storeId: "store-1",
      type: "WOOCOMMERCE",
    });
    const created = await service.createCredential("user-1", integration.id, {
      name: "Woo plugin",
      scopes: ["catalog:sync"],
    });

    const revoked = await service.revokeCredential(
      "user-1",
      created.credential.id,
    );

    expect(revoked.status).toBe("REVOKED");
    expect(revoked.revokedAt).not.toBeNull();
    await expect(
      service.revokeCredential("user-1", created.credential.id),
    ).rejects.toBeInstanceOf(ApiErrorException);
  });

  it("disconnects an integration and revokes active credentials", async () => {
    const prisma = new FakePrisma();
    const service = new IntegrationsService(prisma as never);
    const integration = await service.upsertIntegration("user-1", {
      storeId: "store-1",
      type: "SHOPIFY",
    });
    await service.createCredential("user-1", integration.id, {
      name: "Plugin",
      scopes: ["catalog:sync"],
    });

    const disconnected = await service.disconnectIntegration(
      "user-1",
      integration.id,
    );

    expect(disconnected.status).toBe("DISCONNECTED");
    expect(disconnected.credentials[0]?.status).toBe("REVOKED");
  });
});

type StoredIntegration = {
  id: string;
  organizationId: string;
  type: IntegrationType;
  status: IntegrationStatus;
  externalAccountId: string | null;
  externalAccountName: string | null;
  metadata: Record<string, unknown> | null;
  connectedAt: Date | null;
  disconnectedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type StoredCredential = {
  id: string;
  integrationId: string;
  organizationId: string;
  name: string;
  tokenPrefix: string;
  tokenHash: string;
  scopes: string[];
  status: IntegrationCredentialStatus;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  revokedAt: Date | null;
};

class FakePrisma {
  readonly integrations: StoredIntegration[] = [];
  readonly credentials: StoredCredential[] = [];
  readonly auditLogs: Array<Record<string, unknown>> = [];

  readonly integrationProviderCredential = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };

  readonly integrationOauthState = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };

  readonly organization = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      if (where.id !== "store-1") {
        return null;
      }
      return { id: "store-1", status: this.storeStatus };
    }),
  };

  readonly integration = {
    count: vi.fn(
      async ({
        where,
      }: {
        where: { organizationId?: string; type?: string };
      }) => this.filterIntegrations(where).length,
    ),
    findMany: vi.fn(
      async ({
        where,
      }: {
        where: { organizationId?: string; type?: string };
      }) =>
        this.filterIntegrations(where).map((item) =>
          this.withIntegrationRelations(item),
        ),
    ),
    findUnique: vi.fn(
      async ({
        where,
        select,
      }: {
        where: { id?: string };
        select?: { organizationId?: boolean };
      }) => {
        const integration = this.integrations.find(
          (item) => item.id === where.id,
        );
        if (!integration) {
          return null;
        }
        if (select) {
          return { organizationId: integration.organizationId };
        }
        return this.withIntegrationRelations(integration);
      },
    ),
    upsert: vi.fn(
      async ({
        where,
        create,
        update,
      }: {
        where: {
          organizationId_type: {
            organizationId: string;
            type: IntegrationType;
          };
        };
        create: Omit<
          StoredIntegration,
          "createdAt" | "updatedAt" | "metadata"
        > & {
          metadata?: Record<string, unknown> | null;
          createdAt?: Date;
          updatedAt?: Date;
        };
        update: Partial<StoredIntegration>;
      }) => {
        const existing = this.integrations.find(
          (item) =>
            item.organizationId === where.organizationId_type.organizationId &&
            item.type === where.organizationId_type.type,
        );
        if (existing) {
          Object.assign(existing, update, {
            updatedAt: new Date("2026-09-07T00:00:00.000Z"),
          });
          return this.withIntegrationRelations(existing);
        }
        const created: StoredIntegration = {
          ...create,
          metadata: create.metadata ?? null,
          createdAt: create.createdAt ?? new Date("2026-09-07T00:00:00.000Z"),
          updatedAt: create.updatedAt ?? new Date("2026-09-07T00:00:00.000Z"),
        };
        this.integrations.push(created);
        return this.withIntegrationRelations(created);
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<StoredIntegration>;
      }) => {
        const integration = this.integrations.find(
          (item) => item.id === where.id,
        );
        if (!integration) {
          throw new Error("missing integration");
        }
        Object.assign(integration, data, {
          updatedAt: new Date("2026-09-07T00:00:00.000Z"),
        });
        return this.withIntegrationRelations(integration);
      },
    ),
  };

  readonly integrationCredential = {
    findUnique: vi.fn(
      async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: { organizationId?: boolean };
      }) => {
        const credential = this.credentials.find(
          (item) => item.id === where.id,
        );
        if (!credential) {
          return null;
        }
        if (select) {
          return { organizationId: credential.organizationId };
        }
        return {
          ...credential,
          integration: {
            type:
              this.integrations.find(
                (item) => item.id === credential.integrationId,
              )?.type ?? IntegrationType.SHOPIFY,
          },
        };
      },
    ),
    create: vi.fn(
      async ({
        data,
      }: {
        data: Omit<
          StoredCredential,
          "createdAt" | "lastUsedAt" | "revokedAt"
        > & {
          lastUsedAt?: Date | null;
          revokedAt?: Date | null;
          createdAt?: Date;
        };
      }) => {
        const created: StoredCredential = {
          ...data,
          scopes: [...data.scopes],
          expiresAt: data.expiresAt ?? null,
          lastUsedAt: data.lastUsedAt ?? null,
          createdAt: data.createdAt ?? new Date("2026-09-07T00:00:00.000Z"),
          revokedAt: data.revokedAt ?? null,
        };
        this.credentials.push(created);
        return this.withCredentialRelations(created);
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<StoredCredential>;
      }) => {
        const credential = this.credentials.find(
          (item) => item.id === where.id,
        );
        if (!credential) {
          throw new Error("missing credential");
        }
        Object.assign(credential, data);
        return this.withCredentialRelations(credential);
      },
    ),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { integrationId: string; status: IntegrationCredentialStatus };
        data: Partial<StoredCredential>;
      }) => {
        let count = 0;
        for (const credential of this.credentials) {
          if (
            credential.integrationId === where.integrationId &&
            credential.status === where.status
          ) {
            Object.assign(credential, data);
            count += 1;
          }
        }
        return { count };
      },
    ),
  };

  readonly auditLog = {
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      this.auditLogs.push(data);
      return data;
    }),
  };

  constructor(
    private readonly options: { storeStatus?: OrganizationStatus } = {},
  ) {}

  get storeStatus() {
    return this.options.storeStatus ?? OrganizationStatus.ACTIVE;
  }

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }

  private filterIntegrations(where: {
    organizationId?: string;
    type?: string;
  }) {
    return this.integrations.filter(
      (integration) =>
        (!where.organizationId ||
          integration.organizationId === where.organizationId) &&
        (!where.type || integration.type === where.type),
    );
  }

  private withIntegrationRelations(integration: StoredIntegration) {
    return {
      ...integration,
      organization: { id: integration.organizationId, name: "Store One" },
      credentials: this.credentials
        .filter((credential) => credential.integrationId === integration.id)
        .map((credential) => this.withCredentialRelations(credential)),
    };
  }

  private withCredentialRelations(credential: StoredCredential) {
    return {
      ...credential,
      createdByUser: { email: "admin@selfx.test" },
    };
  }
}
