import {
  IntegrationCredentialStatus,
  IntegrationStatus,
  IntegrationType,
  OrganizationStatus,
} from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  INTEGRATION_AUTH_ERROR_CODES,
  IntegrationTokenAuthService,
} from "./integration-token-auth.service.js";
import {
  INTEGRATION_TOKEN_PREFIX_LENGTH,
  hashIntegrationToken,
} from "./integrations.service.js";

describe("IntegrationTokenAuthService", () => {
  it("verifies a valid integration token, enforces scopes and updates last used time", async () => {
    const rawToken = "selfx_shopify_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const prisma = new FakePrisma([
      storedCredential({
        rawToken,
        scopes: ["catalog:sync", "tryon:create"],
      }),
    ]);
    const service = new IntegrationTokenAuthService(prisma as never);

    const context = await service.verifyRequest(
      request({ "x-selfx-integration-token": rawToken }),
      ["catalog:sync"],
    );

    expect(context).toEqual({
      credentialId: "credential-1",
      integrationId: "integration-1",
      integrationType: IntegrationType.SHOPIFY,
      tokenPrefix: rawToken.slice(0, INTEGRATION_TOKEN_PREFIX_LENGTH),
      storeId: "store-1",
      storeName: "Store One",
      externalAccountId: "demo.myshopify.com",
      externalAccountName: "Demo Shop",
      scopes: ["catalog:sync", "tryon:create"],
    });
    expect(prisma.integrationCredential.update).toHaveBeenCalledWith({
      where: { id: "credential-1" },
      data: { lastUsedAt: expect.any(Date) },
    });
  });

  it("supports Authorization Bearer integration tokens", async () => {
    const rawToken = "selfx_woocommerce_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new IntegrationTokenAuthService(
      new FakePrisma([
        storedCredential({
          rawToken,
          integrationType: IntegrationType.WOOCOMMERCE,
          scopes: ["products:read"],
        }),
      ]) as never,
    );

    await expect(
      service.verifyRequest(request({ authorization: `Bearer ${rawToken}` }), [
        "products:read",
      ]),
    ).resolves.toMatchObject({
      integrationType: IntegrationType.WOOCOMMERCE,
      scopes: ["products:read"],
    });
  });

  it("rejects missing integration tokens", async () => {
    const service = new IntegrationTokenAuthService(
      new FakePrisma([]) as never,
    );

    await expect(service.verifyRequest(request({}))).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: INTEGRATION_AUTH_ERROR_CODES.missingToken,
        }),
      }),
    });
  });

  it("rejects invalid integration tokens without updating last used", async () => {
    const prisma = new FakePrisma([
      storedCredential({
        rawToken: "selfx_shopify_abcdefghijklmnopqrstuvwxyzABCDEFGH",
      }),
    ]);
    const service = new IntegrationTokenAuthService(prisma as never);

    await expect(
      service.verifyToken("selfx_shopify_not-the-real-secret"),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: INTEGRATION_AUTH_ERROR_CODES.invalidToken,
        }),
      }),
    });
    expect(prisma.integrationCredential.update).not.toHaveBeenCalled();
  });

  it("rejects revoked integration tokens", async () => {
    const rawToken = "selfx_shopify_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new IntegrationTokenAuthService(
      new FakePrisma([
        storedCredential({
          rawToken,
          status: IntegrationCredentialStatus.REVOKED,
          revokedAt: new Date("2026-09-01T00:00:00.000Z"),
        }),
      ]) as never,
    );

    await expect(service.verifyToken(rawToken)).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: INTEGRATION_AUTH_ERROR_CODES.revokedToken,
        }),
      }),
    });
  });

  it("rejects expired integration tokens", async () => {
    const rawToken = "selfx_shopify_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new IntegrationTokenAuthService(
      new FakePrisma([
        storedCredential({
          rawToken,
          expiresAt: new Date("2020-01-01T00:00:00.000Z"),
        }),
      ]) as never,
    );

    await expect(service.verifyToken(rawToken)).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: INTEGRATION_AUTH_ERROR_CODES.expiredToken,
        }),
      }),
    });
  });

  it("rejects tokens for disconnected integrations", async () => {
    const rawToken = "selfx_shopify_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new IntegrationTokenAuthService(
      new FakePrisma([
        storedCredential({
          rawToken,
          integrationStatus: IntegrationStatus.DISCONNECTED,
        }),
      ]) as never,
    );

    await expect(service.verifyToken(rawToken)).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: INTEGRATION_AUTH_ERROR_CODES.integrationInactive,
        }),
      }),
    });
  });

  it("rejects tokens for inactive Stores", async () => {
    const rawToken = "selfx_shopify_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new IntegrationTokenAuthService(
      new FakePrisma([
        storedCredential({
          rawToken,
          storeStatus: OrganizationStatus.SUSPENDED,
        }),
      ]) as never,
    );

    await expect(service.verifyToken(rawToken)).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: INTEGRATION_AUTH_ERROR_CODES.storeInactive,
        }),
      }),
    });
  });

  it("rejects tokens missing the required scope", async () => {
    const rawToken = "selfx_shopify_abcdefghijklmnopqrstuvwxyzABCDEFGH";
    const service = new IntegrationTokenAuthService(
      new FakePrisma([
        storedCredential({ rawToken, scopes: ["tryon:read"] }),
      ]) as never,
    );

    await expect(
      service.verifyToken(rawToken, ["catalog:sync"]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        error: expect.objectContaining({
          code: INTEGRATION_AUTH_ERROR_CODES.scopeDenied,
        }),
      }),
    });
  });
});

type StoredCredential = {
  id: string;
  tokenPrefix: string;
  tokenHash: string;
  scopes: string[];
  status: IntegrationCredentialStatus;
  expiresAt: Date | null;
  revokedAt: Date | null;
  integration: {
    id: string;
    type: IntegrationType;
    status: IntegrationStatus;
    externalAccountId: string | null;
    externalAccountName: string | null;
    organization: {
      id: string;
      name: string;
      status: OrganizationStatus;
    };
  };
};

class FakePrisma {
  readonly integrationCredential = {
    findFirst: vi.fn(
      async ({ where }: { where: { tokenPrefix: string } }) =>
        this.credentials.find(
          (credential) => credential.tokenPrefix === where.tokenPrefix,
        ) ?? null,
    ),
    update: vi.fn(async () => undefined),
  };

  constructor(private readonly credentials: StoredCredential[]) {}
}

function storedCredential(
  input: {
    rawToken: string;
    id?: string;
    scopes?: string[];
    status?: IntegrationCredentialStatus;
    expiresAt?: Date | null;
    revokedAt?: Date | null;
    integrationType?: IntegrationType;
    integrationStatus?: IntegrationStatus;
    storeStatus?: OrganizationStatus;
  } = { rawToken: "selfx_shopify_abcdefghijklmnopqrstuvwxyzABCDEFGH" },
): StoredCredential {
  return {
    id: input.id ?? "credential-1",
    tokenPrefix: input.rawToken.slice(0, INTEGRATION_TOKEN_PREFIX_LENGTH),
    tokenHash: hashIntegrationToken(input.rawToken),
    scopes: input.scopes ?? ["catalog:sync"],
    status: input.status ?? IntegrationCredentialStatus.ACTIVE,
    expiresAt: input.expiresAt ?? null,
    revokedAt: input.revokedAt ?? null,
    integration: {
      id: "integration-1",
      type: input.integrationType ?? IntegrationType.SHOPIFY,
      status: input.integrationStatus ?? IntegrationStatus.ACTIVE,
      externalAccountId: "demo.myshopify.com",
      externalAccountName: "Demo Shop",
      organization: {
        id: "store-1",
        name: "Store One",
        status: input.storeStatus ?? OrganizationStatus.ACTIVE,
      },
    },
  };
}

function request(headers: Record<string, string>) {
  return { headers } as never;
}
