import { OrganizationStatus } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  DEVELOPER_API_KEY_PREFIX_LENGTH,
  hashApiKeySecret,
} from "./developer-api-key.service.js";
import {
  PUBLIC_API_AUTH_ERROR_CODES,
  PublicApiKeyAuthService,
} from "./public-api-key-auth.service.js";

describe("PublicApiKeyAuthService", () => {
  it("verifies a valid API key, enforces scopes and updates last used time", async () => {
    const rawKey = "selfx_test_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const prisma = new FakePrisma([
      storedKey({
        rawKey,
        scopes: ["tryon:create", "tryon:read"],
      }),
    ]);
    const service = new PublicApiKeyAuthService(
      prisma as never,
      entitlements() as never,
    );

    const context = await service.verifyRequest(
      request({ "x-selfx-api-key": rawKey }),
      ["tryon:create"],
    );

    expect(context).toEqual({
      apiKeyId: "key-1",
      keyPrefix: rawKey.slice(0, DEVELOPER_API_KEY_PREFIX_LENGTH),
      storeId: "store-1",
      storeName: "Store One",
      environment: "TEST",
      scopes: ["tryon:create", "tryon:read"],
    });
    expect(prisma.apiKey.update).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("allows Store-issued API keys under the Store plan instead of creator role", async () => {
    const key = storedKey();
    key.createdByUserId = null;
    const db = new FakePrisma([key]);
    const plan = entitlements();
    const service = new PublicApiKeyAuthService(db as never, plan as never);
    await expect(
      service.verifyApiKey("selfx_test_abcdefghijklmnopqrstuvwxyzABCDEFGH"),
    ).resolves.toMatchObject({ storeId: "store-1" });
    expect(plan.assertStoreHasFeature).toHaveBeenCalledWith(
      "store-1",
      "PUBLIC_API",
    );
  });
  it("supports Authorization Bearer API keys", async () => {
    const rawKey = "selfx_live_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const prisma = new FakePrisma([
      storedKey({ rawKey, environment: "LIVE", scopes: ["usage:read"] }),
    ]);
    const service = new PublicApiKeyAuthService(
      prisma as never,
      entitlements() as never,
    );

    await expect(
      service.verifyRequest(request({ authorization: `Bearer ${rawKey}` }), [
        "usage:read",
      ]),
    ).resolves.toMatchObject({ environment: "LIVE", scopes: ["usage:read"] });
  });

  it("rejects missing API keys", async () => {
    const service = new PublicApiKeyAuthService(
      new FakePrisma([]) as never,
      entitlements() as never,
    );

    await expect(service.verifyRequest(request({}))).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: PUBLIC_API_AUTH_ERROR_CODES.missingKey,
        }),
      }),
    });
  });

  it("rejects invalid API keys without updating last used", async () => {
    const prisma = new FakePrisma([
      storedKey({ rawKey: "selfx_test_abcdefghijklmnopqrstuvwxyzABCDEFGH" }),
    ]);
    const service = new PublicApiKeyAuthService(
      prisma as never,
      entitlements() as never,
    );

    await expect(
      service.verifyApiKey("selfx_test_not-the-real-secret"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: PUBLIC_API_AUTH_ERROR_CODES.invalidKey,
        }),
      }),
    });
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });

  it("rejects revoked API keys", async () => {
    const rawKey = "selfx_test_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new PublicApiKeyAuthService(
      new FakePrisma([
        storedKey({
          rawKey,
          status: "REVOKED",
          revokedAt: new Date("2026-08-01T00:00:00.000Z"),
        }),
      ]) as never,
      entitlements() as never,
    );

    await expect(service.verifyApiKey(rawKey)).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: PUBLIC_API_AUTH_ERROR_CODES.revokedKey,
        }),
      }),
    });
  });

  it("rejects expired API keys", async () => {
    const rawKey = "selfx_test_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new PublicApiKeyAuthService(
      new FakePrisma([
        storedKey({
          rawKey,
          expiresAt: new Date("2020-01-01T00:00:00.000Z"),
        }),
      ]) as never,
      entitlements() as never,
    );

    await expect(service.verifyApiKey(rawKey)).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: PUBLIC_API_AUTH_ERROR_CODES.expiredKey,
        }),
      }),
    });
  });

  it("rejects keys for inactive Stores", async () => {
    const rawKey = "selfx_test_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new PublicApiKeyAuthService(
      new FakePrisma([
        storedKey({ rawKey, storeStatus: OrganizationStatus.SUSPENDED }),
      ]) as never,
      entitlements() as never,
    );

    await expect(service.verifyApiKey(rawKey)).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: PUBLIC_API_AUTH_ERROR_CODES.storeInactive,
        }),
      }),
    });
  });

  it("rejects API keys missing the required scope", async () => {
    const rawKey = "selfx_test_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new PublicApiKeyAuthService(
      new FakePrisma([storedKey({ rawKey, scopes: ["tryon:read"] })]) as never,
      entitlements() as never,
    );

    await expect(
      service.verifyApiKey(rawKey, ["tryon:create"]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: PUBLIC_API_AUTH_ERROR_CODES.scopeDenied,
        }),
      }),
    });
  });

  it("blocks key use when the Store plan no longer includes Public API", async () => {
    const plan = entitlements();
    plan.assertStoreHasFeature.mockRejectedValue(new Error("feature disabled"));
    const prisma = new FakePrisma([storedKey()]);
    const service = new PublicApiKeyAuthService(prisma as never, plan as never);
    await expect(
      service.verifyApiKey("selfx_test_abcdefghijklmnopqrstuvwxyzABCDEFGH"),
    ).rejects.toThrow("feature disabled");
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });
});

type StoredApiKey = {
  createdByUserId: string | null;
  createdByUser: { status: string; deletedAt: Date | null };
  id: string;
  keyPrefix: string;
  secretHash: string;
  environment: string;
  status: string;
  scopes: string[];
  expiresAt: Date | null;
  revokedAt: Date | null;
  organization: {
    id: string;
    name: string;
    status: OrganizationStatus;
  };
};

class FakePrisma {
  readonly apiKey = {
    findFirst: vi.fn(
      async ({ where }: { where: { keyPrefix: string } }) =>
        this.keys.find((key) => key.keyPrefix === where.keyPrefix) ?? null,
    ),
    update: vi.fn(async () => undefined),
  };

  constructor(private readonly keys: StoredApiKey[]) {}
}

function storedKey(
  input: {
    rawKey: string;
    id?: string;
    environment?: string;
    status?: string;
    scopes?: string[];
    expiresAt?: Date | null;
    revokedAt?: Date | null;
    storeStatus?: OrganizationStatus;
  } = { rawKey: "selfx_test_abcdefghijklmnopqrstuvwxyzABCDEFGH" },
): StoredApiKey {
  return {
    createdByUserId: "platform-user",
    createdByUser: { status: "ACTIVE", deletedAt: null },
    id: input.id ?? "key-1",
    keyPrefix: input.rawKey.slice(0, DEVELOPER_API_KEY_PREFIX_LENGTH),
    secretHash: hashApiKeySecret(input.rawKey),
    environment: input.environment ?? "TEST",
    status: input.status ?? "ACTIVE",
    scopes: input.scopes ?? ["tryon:create"],
    expiresAt: input.expiresAt ?? null,
    revokedAt: input.revokedAt ?? null,
    organization: {
      id: "store-1",
      name: "Store One",
      status: input.storeStatus ?? OrganizationStatus.ACTIVE,
    },
  };
}

function request(headers: Record<string, string>) {
  return { headers } as never;
}

function entitlements() {
  return { assertStoreHasFeature: vi.fn().mockResolvedValue(undefined) };
}
