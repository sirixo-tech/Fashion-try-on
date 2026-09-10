import { createHash, randomBytes } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import {
  IntegrationCredentialStatus,
  IntegrationStatus,
  OrganizationStatus,
  Prisma,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type CreateShopifyLinkSessionDto,
  type ShopifyLinkSessionApprovalDto,
  type ShopifyLinkSessionCreatedDto,
  type ShopifyLinkSessionDetailsDto,
  type ShopifyLinkSessionRedeemedDto,
} from "./dto/shopify-link.dto.js";
import {
  hashIntegrationToken,
  INTEGRATION_TOKEN_PREFIX_LENGTH,
} from "./integrations.service.js";
import { loadShopifyLinkConfig } from "./shopify-link.config.js";

const linkLifetimeMs = 10 * 60 * 1000;
const integrationCredentialName = "SelfX Shopify app";
const linkTokenPattern = /^[A-Za-z0-9_-]{43}$/;
const shopIdPattern = /^gid:\/\/shopify\/Shop\/\d+$/;

export const SHOPIFY_LINK_ERROR_CODES = {
  configuration: "SHOPIFY_LINK_CONFIGURATION_ERROR",
  invalid: "SHOPIFY_LINK_SESSION_INVALID",
  expired: "SHOPIFY_LINK_SESSION_EXPIRED",
  pending: "SHOPIFY_LINK_SESSION_PENDING_APPROVAL",
  redeemed: "SHOPIFY_LINK_SESSION_ALREADY_REDEEMED",
  storeNotFound: "SHOPIFY_LINK_STORE_NOT_FOUND",
  shopAlreadyLinked: "SHOPIFY_SHOP_ALREADY_LINKED",
  storeAlreadyLinked: "SHOPIFY_STORE_ALREADY_LINKED",
} as const;

@Injectable()
export class ShopifyLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: CreateShopifyLinkSessionDto,
  ): Promise<ShopifyLinkSessionCreatedDto> {
    const config = requireConfig();
    const shopDomain = normalizeShopDomain(input.shopDomain);
    const externalAccountId = normalizeShopId(input.externalAccountId);
    const externalAccountName = nullableTrim(input.externalAccountName);
    const linkToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + linkLifetimeMs);
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.shopifyLinkSession.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      return tx.shopifyLinkSession.create({
        data: {
          id: createSelfxId(),
          tokenHash: hashLinkToken(linkToken),
          shopDomain,
          externalAccountId,
          externalAccountName,
          expiresAt,
        },
      });
    });
    const approvalUrl = new URL(
      "/app/integrations/shopify/link",
      config.webBaseUrl,
    );
    approvalUrl.searchParams.set("token", linkToken);
    return {
      id: session.id,
      linkToken,
      approvalUrl: approvalUrl.toString(),
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async approve(
    actorUserId: string,
    linkToken: string,
    storeId: string,
  ): Promise<ShopifyLinkSessionApprovalDto> {
    const session = await this.requireSession(linkToken);
    assertNotExpired(session.expiresAt);
    if (session.redeemedAt) {
      if (session.organizationId !== storeId) throw shopAlreadyLinked();
      return this.approvalResponse(session, "REDEEMED");
    }
    if (session.approvedAt) {
      if (session.organizationId !== storeId) throw shopAlreadyLinked();
      return this.approvalResponse(session, "APPROVED");
    }

    const store = await this.prisma.organization.findFirst({
      where: { id: storeId, status: OrganizationStatus.ACTIVE },
      select: { id: true, name: true },
    });
    if (!store) throw storeNotFound();
    await this.assertLinkAvailable(
      storeId,
      session.externalAccountId,
      session.shopDomain,
    );

    const now = new Date();
    const approved = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.shopifyLinkSession.updateMany({
        where: {
          id: session.id,
          approvedAt: null,
          redeemedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          organizationId: storeId,
          approvedByUserId: actorUserId,
          approvedAt: now,
        },
      });
      if (claimed.count !== 1) throw invalidSession();
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: "SHOPIFY_LINK_SESSION_APPROVED",
          actorUserId,
          organizationId: storeId,
          resourceType: "shopify_link_session",
          resourceId: session.id,
          metadata: {
            shop_domain: session.shopDomain,
            external_account_id: session.externalAccountId,
          },
        },
      });
      return tx.shopifyLinkSession.findUniqueOrThrow({
        where: { id: session.id },
        include: { organization: { select: { name: true } } },
      });
    });
    return this.approvalResponse(approved, "APPROVED");
  }

  async describe(linkToken: string): Promise<ShopifyLinkSessionDetailsDto> {
    const session = await this.requireSession(linkToken);
    assertNotExpired(session.expiresAt);
    return {
      id: session.id,
      status: session.redeemedAt
        ? "REDEEMED"
        : session.approvedAt
          ? "APPROVED"
          : "PENDING",
      shopDomain: session.shopDomain,
      externalAccountName: session.externalAccountName,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async redeem(linkToken: string): Promise<ShopifyLinkSessionRedeemedDto> {
    const session = await this.requireSession(linkToken);
    assertNotExpired(session.expiresAt);
    if (session.redeemedAt) throw alreadyRedeemed();
    if (
      !session.approvedAt ||
      !session.organizationId ||
      !session.approvedByUserId
    ) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        SHOPIFY_LINK_ERROR_CODES.pending,
        "The Shopify link must be approved in SelfX before redemption.",
      );
    }
    const store = await this.prisma.organization.findFirst({
      where: {
        id: session.organizationId,
        status: OrganizationStatus.ACTIVE,
      },
      select: { id: true, name: true },
    });
    if (!store) throw storeNotFound();

    const now = new Date();
    const secret = createIntegrationToken();
    const tokenPrefix = secret.slice(0, INTEGRATION_TOKEN_PREFIX_LENGTH);
    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.shopifyLinkSession.updateMany({
        where: {
          id: session.id,
          approvedAt: { not: null },
          redeemedAt: null,
          expiresAt: { gt: now },
        },
        data: { redeemedAt: now },
      });
      if (claimed.count !== 1) throw alreadyRedeemed();

      const [shopIntegration, storeIntegration] = await Promise.all([
        tx.integration.findFirst({
          where: {
            type: "SHOPIFY",
            externalAccountId: session.externalAccountId,
          },
        }),
        tx.integration.findUnique({
          where: {
            organizationId_type: {
              organizationId: store.id,
              type: "SHOPIFY",
            },
          },
        }),
      ]);
      if (shopIntegration && shopIntegration.organizationId !== store.id) {
        throw shopAlreadyLinked();
      }
      if (
        storeIntegration?.externalAccountId &&
        storeIntegration.externalAccountId !== session.externalAccountId &&
        storeIntegration.status !== IntegrationStatus.DISCONNECTED
      ) {
        throw storeAlreadyLinked();
      }

      const metadata = {
        ...jsonObject(storeIntegration?.metadata ?? null),
        shopDomain: session.shopDomain,
        connectionMode: "SHOPIFY_APP",
        linkedAt: now.toISOString(),
      } satisfies Prisma.InputJsonObject;
      const integration = storeIntegration
        ? await tx.integration.update({
            where: { id: storeIntegration.id },
            data: {
              status: IntegrationStatus.ACTIVE,
              externalAccountId: session.externalAccountId,
              externalAccountName: session.externalAccountName,
              metadata,
              connectedAt: now,
              disconnectedAt: null,
            },
          })
        : await tx.integration.create({
            data: {
              id: createSelfxId(),
              organizationId: store.id,
              type: "SHOPIFY",
              status: IntegrationStatus.ACTIVE,
              externalAccountId: session.externalAccountId,
              externalAccountName: session.externalAccountName,
              metadata,
              connectedAt: now,
              createdByUserId: session.approvedByUserId!,
            },
          });

      await tx.integrationProviderCredential.deleteMany({
        where: { integrationId: integration.id },
      });
      await tx.integrationOauthState.deleteMany({
        where: {
          organizationId: store.id,
          provider: "SHOPIFY",
          consumedAt: null,
        },
      });
      await tx.integrationCredential.updateMany({
        where: {
          integrationId: integration.id,
          status: IntegrationCredentialStatus.ACTIVE,
        },
        data: {
          status: IntegrationCredentialStatus.REVOKED,
          revokedAt: now,
        },
      });
      const credential = await tx.integrationCredential.create({
        data: {
          id: createSelfxId(),
          integrationId: integration.id,
          organizationId: store.id,
          name: integrationCredentialName,
          tokenPrefix,
          tokenHash: hashIntegrationToken(secret),
          scopes: ["catalog:sync"],
          status: IntegrationCredentialStatus.ACTIVE,
          createdByUserId: session.approvedByUserId!,
        },
      });
      await tx.shopifyLinkSession.update({
        where: { id: session.id },
        data: { integrationId: integration.id },
      });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action: "SHOPIFY_APP_LINK_REDEEMED",
          actorUserId: session.approvedByUserId!,
          organizationId: store.id,
          resourceType: "integration",
          resourceId: integration.id,
          metadata: {
            shop_domain: session.shopDomain,
            external_account_id: session.externalAccountId,
            credential_id: credential.id,
            token_prefix: tokenPrefix,
          },
        },
      });
      return { integration, credential };
    });

    return {
      status: "LINKED",
      shopDomain: session.shopDomain,
      storeId: store.id,
      storeName: store.name,
      integrationId: result.integration.id,
      credentialId: result.credential.id,
      integrationToken: secret,
    };
  }

  private async requireSession(linkToken: string) {
    if (!linkTokenPattern.test(linkToken)) throw invalidSession();
    const session = await this.prisma.shopifyLinkSession.findUnique({
      where: { tokenHash: hashLinkToken(linkToken) },
      include: { organization: { select: { name: true } } },
    });
    if (!session) throw invalidSession();
    return session;
  }

  private async assertLinkAvailable(
    storeId: string,
    externalAccountId: string,
    shopDomain: string,
  ): Promise<void> {
    const [shopIntegration, storeIntegration, domainIntegration] =
      await Promise.all([
        this.prisma.integration.findFirst({
          where: { type: "SHOPIFY", externalAccountId },
        }),
        this.prisma.integration.findUnique({
          where: {
            organizationId_type: { organizationId: storeId, type: "SHOPIFY" },
          },
        }),
        this.prisma.integration.findFirst({
          where: {
            type: "SHOPIFY",
            metadata: { path: ["shopDomain"], equals: shopDomain },
          },
        }),
      ]);
    if (
      (shopIntegration && shopIntegration.organizationId !== storeId) ||
      (domainIntegration && domainIntegration.organizationId !== storeId)
    ) {
      throw shopAlreadyLinked();
    }
    if (
      storeIntegration?.externalAccountId &&
      storeIntegration.externalAccountId !== externalAccountId &&
      storeIntegration.status !== IntegrationStatus.DISCONNECTED
    ) {
      throw storeAlreadyLinked();
    }
  }

  private approvalResponse(
    session: {
      id: string;
      shopDomain: string;
      organizationId: string | null;
      organization: { name: string } | null;
      approvedAt: Date | null;
      expiresAt: Date;
    },
    status: "APPROVED" | "REDEEMED",
  ): ShopifyLinkSessionApprovalDto {
    if (
      !session.organizationId ||
      !session.organization ||
      !session.approvedAt
    ) {
      throw invalidSession();
    }
    return {
      id: session.id,
      status,
      shopDomain: session.shopDomain,
      storeId: session.organizationId,
      storeName: session.organization.name,
      approvedAt: session.approvedAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    };
  }
}

function createIntegrationToken(): string {
  return `selfx_shopify_${randomBytes(32).toString("base64url")}`;
}

function hashLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function normalizeShopDomain(value: string): string {
  const clean = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(clean)) {
    throw invalidSession();
  }
  return clean;
}

function normalizeShopId(value: string): string {
  const clean = value.trim();
  if (!shopIdPattern.test(clean)) throw invalidSession();
  return clean;
}

function assertNotExpired(expiresAt: Date): void {
  if (expiresAt <= new Date()) {
    throw new ApiErrorException(
      HttpStatus.GONE,
      SHOPIFY_LINK_ERROR_CODES.expired,
      "The Shopify link session has expired. Start the connection again.",
    );
  }
}

function requireConfig() {
  try {
    return loadShopifyLinkConfig();
  } catch {
    throw new ApiErrorException(
      HttpStatus.SERVICE_UNAVAILABLE,
      SHOPIFY_LINK_ERROR_CODES.configuration,
      "Shopify app linking is not configured on this SelfX server.",
    );
  }
}

function invalidSession(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.NOT_FOUND,
    SHOPIFY_LINK_ERROR_CODES.invalid,
    "Shopify link session was not found or is no longer valid.",
  );
}

function storeNotFound(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.NOT_FOUND,
    SHOPIFY_LINK_ERROR_CODES.storeNotFound,
    "An active SelfX Store is required to approve this Shopify link.",
  );
}

function alreadyRedeemed(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.CONFLICT,
    SHOPIFY_LINK_ERROR_CODES.redeemed,
    "The Shopify link session has already been redeemed.",
  );
}

function shopAlreadyLinked(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.CONFLICT,
    SHOPIFY_LINK_ERROR_CODES.shopAlreadyLinked,
    "This Shopify shop is already linked to another SelfX Store.",
  );
}

function storeAlreadyLinked(): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.CONFLICT,
    SHOPIFY_LINK_ERROR_CODES.storeAlreadyLinked,
    "This SelfX Store is already linked to another Shopify shop.",
  );
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.JsonObject)
    : {};
}
