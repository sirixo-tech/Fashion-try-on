import { OrganizationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import {
  DEVELOPER_API_ERROR_CODES,
  DeveloperApiKeyService,
  hashApiKeySecret,
} from "./developer-api-key.service.js";

describe("DeveloperApiKeyService", () => {
  it("creates an API key, stores only its hash and returns the raw secret once", async () => {
    const prisma = new FakePrisma();
    const service = new DeveloperApiKeyService(prisma as never);

    const response = await service.createKey("user-1", {
      storeId: "store-1",
      name: "Kiosk Partner",
      environment: "TEST",
      scopes: ["tryon:create", "tryon:read", "tryon:create"],
    });

    expect(response.secret).toMatch(/^selfx_test_/);
    expect(response.apiKey).toMatchObject({
      storeId: "store-1",
      storeName: "Store One",
      name: "Kiosk Partner",
      environment: "TEST",
      status: "ACTIVE",
      scopes: ["tryon:create", "tryon:read"],
    });
    expect(response.apiKey).not.toHaveProperty("secretHash");

    const stored = prisma.apiKeys[0]!;
    expect(stored.keyPrefix).toBe(response.secret.slice(0, 24));
    expect(stored.secretHash).toBe(hashApiKeySecret(response.secret));
    expect(stored.secretHash).not.toContain(response.secret);
    expect(prisma.auditLogs[0]).toMatchObject({
      action: "DEVELOPER_API_KEY_CREATED",
      organizationId: "store-1",
      resourceType: "api_key",
    });
    expect(JSON.stringify(prisma.auditLogs[0])).not.toContain(response.secret);
  });

  it("rejects key creation for inactive stores", async () => {
    const prisma = new FakePrisma({
      storeStatus: OrganizationStatus.SUSPENDED,
    });
    const service = new DeveloperApiKeyService(prisma as never);

    await expect(
      service.createKey("user-1", {
        storeId: "store-1",
        name: "Partner",
        environment: "LIVE",
        scopes: ["tryon:create"],
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: DEVELOPER_API_ERROR_CODES.storeNotFound,
        }),
      }),
    });
  });

  it("lists API keys without exposing stored secrets", async () => {
    const prisma = new FakePrisma();
    const service = new DeveloperApiKeyService(prisma as never);
    await service.createKey("user-1", {
      storeId: "store-1",
      name: "Partner",
      environment: "LIVE",
      scopes: ["usage:read"],
    });

    const response = await service.listKeys({ storeId: "store-1" });

    expect(response.data).toHaveLength(1);
    expect(response.data[0]).toMatchObject({
      keyPrefix: expect.stringMatching(/^selfx_live_/),
      scopes: ["usage:read"],
    });
    expect(response.data[0]).not.toHaveProperty("secretHash");
    expect(response.pagination.total).toBe(1);
  });

  it("revokes active keys and rejects duplicate revocation", async () => {
    const prisma = new FakePrisma();
    const service = new DeveloperApiKeyService(prisma as never);
    const created = await service.createKey("user-1", {
      storeId: "store-1",
      name: "Partner",
      environment: "TEST",
      scopes: ["tryon:create"],
    });

    const revoked = await service.revokeKey("user-1", created.apiKey.id);

    expect(revoked.status).toBe("REVOKED");
    expect(revoked.revokedAt).not.toBeNull();
    await expect(
      service.revokeKey("user-1", created.apiKey.id),
    ).rejects.toBeInstanceOf(ApiErrorException);
  });
});

type StoredApiKey = {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  secretHash: string;
  environment: string;
  status: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  revokedAt: Date | null;
};

class FakePrisma {
  readonly apiKeys: StoredApiKey[] = [];
  readonly auditLogs: Array<Record<string, unknown>> = [];

  readonly organization = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      if (where.id !== "store-1") {
        return null;
      }
      return { id: "store-1", status: this.storeStatus };
    }),
  };

  readonly apiKey = {
    count: vi.fn(
      async ({ where }: { where: { organizationId?: string } }) =>
        this.filterKeys(where).length,
    ),
    findMany: vi.fn(async ({ where }: { where: { organizationId?: string } }) =>
      this.filterKeys(where).map((key) => this.withRelations(key)),
    ),
    findUnique: vi.fn(
      async ({
        where,
        select,
      }: {
        where: { id: string };
        select?: { organizationId?: boolean; id?: boolean; status?: boolean };
      }) => {
        const key = this.apiKeys.find((item) => item.id === where.id);
        if (!key) {
          return null;
        }
        if (!select) {
          return this.withRelations(key);
        }
        return Object.fromEntries(
          Object.keys(select).map((field) => [
            field,
            key[field as keyof StoredApiKey],
          ]),
        );
      },
    ),
    create: vi.fn(
      async ({
        data,
      }: {
        data: Omit<StoredApiKey, "createdAt" | "lastUsedAt" | "revokedAt"> & {
          lastUsedAt?: Date | null;
          revokedAt?: Date | null;
          createdAt?: Date;
        };
      }) => {
        const created: StoredApiKey = {
          ...data,
          scopes: [...data.scopes],
          expiresAt: data.expiresAt ?? null,
          lastUsedAt: data.lastUsedAt ?? null,
          createdAt: data.createdAt ?? new Date("2026-08-28T00:00:00.000Z"),
          revokedAt: data.revokedAt ?? null,
        };
        this.apiKeys.push(created);
        return this.withRelations(created);
      },
    ),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<StoredApiKey>;
      }) => {
        const key = this.apiKeys.find((item) => item.id === where.id);
        if (!key) {
          throw new Error("missing key");
        }
        Object.assign(key, data);
        return this.withRelations(key);
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

  private filterKeys(where: { organizationId?: string }) {
    return this.apiKeys.filter(
      (key) =>
        !where.organizationId || key.organizationId === where.organizationId,
    );
  }

  private withRelations(key: StoredApiKey) {
    return {
      ...key,
      organization: { id: key.organizationId, name: "Store One" },
      createdByUser: { email: "admin@selfx.test" },
    };
  }
}
