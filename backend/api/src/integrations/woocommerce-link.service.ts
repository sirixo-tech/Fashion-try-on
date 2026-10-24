import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { HttpStatus, Injectable } from "@nestjs/common";
import {
  IntegrationCredentialStatus,
  IntegrationStatus,
  OrganizationStatus,
} from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { fetchPublicCatalogImage, publicCommerceUrl } from "../catalog/catalog-url-policy.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type CreateWooCommerceLinkSessionDto,
  type WooCommerceLinkCreatedDto,
  type WooCommerceLinkDetailsDto,
  type WooCommerceLinkRedeemedDto,
} from "./dto/woocommerce-link.dto.js";
import {
  hashIntegrationToken,
  INTEGRATION_TOKEN_PREFIX_LENGTH,
} from "./integrations.service.js";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const linkLifetimeMs = 10 * 60 * 1000;

function failure(status: HttpStatus, code: string, message: string) {
  return new ApiErrorException(status, code, message);
}
function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
function requireToken(value: string): string {
  if (!tokenPattern.test(value))
    throw failure(HttpStatus.NOT_FOUND, "WOOCOMMERCE_LINK_INVALID", "Connection request is invalid.");
  return value;
}
function requireSite(value: string): string {
  const url = publicCommerceUrl(value);
  if (url.protocol !== "https:" || url.search || url.hash)
    throw failure(HttpStatus.BAD_REQUEST, "WOOCOMMERCE_SITE_INVALID", "Use the public HTTPS website address.");
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}
function requireAdminUrl(value: string, siteUrl: string): string {
  const url = publicCommerceUrl(value);
  if (url.protocol !== "https:" || url.origin !== new URL(siteUrl).origin ||
      !url.pathname.endsWith("/wp-admin/admin.php") ||
      url.searchParams.get("page") !== "selfx-woocommerce" ||
      url.searchParams.get("selfx_return") !== "1" ||
      [...url.searchParams.keys()].length !== 2 || url.hash)
    throw failure(HttpStatus.BAD_REQUEST, "WOOCOMMERCE_SITE_INVALID", "Use the public HTTPS WordPress admin address.");
  return url.toString();
}

@Injectable()
export class WooCommerceLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateWooCommerceLinkSessionDto): Promise<WooCommerceLinkCreatedDto> {
    this.approvalUrl(input.linkToken);
    const siteUrl = requireSite(input.siteUrl);
    const adminUrl = requireAdminUrl(input.adminUrl, siteUrl);
    const linkToken = requireToken(input.linkToken);
    const redeemSecret = requireToken(input.redeemSecret);
    if (linkToken === redeemSecret)
      throw failure(HttpStatus.BAD_REQUEST, "WOOCOMMERCE_LINK_INVALID", "Connection request is invalid.");
    const tokenHash = digest(linkToken);
    // The challenge is stored only by this WordPress installation. A caller
    // cannot claim another website merely by supplying its public URL.
    const proofUrl = new URL(`${siteUrl}/`);
    proofUrl.searchParams.set("rest_route", "/selfx/v1/link-proof");
    proofUrl.searchParams.set("challenge", tokenHash);
    let proof: { siteUrl?: string; adminUrl?: string; challenge?: string };
    try {
      const response = await fetchPublicCatalogImage(proofUrl.href, 1024, 3);
      proof = JSON.parse(response.buffer.toString("utf8")) as typeof proof;
    } catch {
      throw failure(HttpStatus.BAD_REQUEST, "WOOCOMMERCE_SITE_UNVERIFIED", "The SelfX plugin could not be verified at this website.");
    }
    if (proof.siteUrl !== siteUrl || proof.adminUrl !== adminUrl || proof.challenge !== tokenHash)
      throw failure(HttpStatus.BAD_REQUEST, "WOOCOMMERCE_SITE_UNVERIFIED", "The SelfX plugin could not be verified at this website.");

    const now = new Date();
    const expiresAt = new Date(now.getTime() + linkLifetimeMs);
    const existing = await this.prisma.wooCommerceLinkSession.findUnique({ where: { tokenHash } });
    if (existing && existing.expiresAt > now && existing.siteUrl === siteUrl && existing.adminUrl === adminUrl &&
        existing.redeemSecretHash === digest(redeemSecret) && !existing.redeemedAt)
      return this.created(linkToken, existing.expiresAt);
    if (existing)
      throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_LINK_INVALID", "Start a new connection request in WooCommerce.");
    await this.prisma.wooCommerceLinkSession.create({
      data: {
        id: createSelfxId(), tokenHash, redeemSecretHash: digest(redeemSecret),
        siteUrl, adminUrl, expiresAt,
      },
    });
    return this.created(linkToken, expiresAt);
  }

  async describe(linkToken: string): Promise<WooCommerceLinkDetailsDto> {
    const session = await this.requireSession(linkToken);
    return {
      status: session.redeemedAt ? "REDEEMED" : session.approvedAt ? "APPROVED" : "PENDING",
      siteUrl: session.siteUrl,
      adminUrl: session.adminUrl,
      storeId: session.organizationId,
      storeName: session.organization?.name ?? null,
      expiresAt: session.expiresAt.toISOString(),
    };
  }

  async approve(userId: string, linkToken: string, storeId: string): Promise<WooCommerceLinkDetailsDto> {
    const session = await this.requireSession(linkToken);
    if (session.approvedAt) {
      if (session.organizationId !== storeId)
        throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_LINK_ALREADY_APPROVED", "This website is already approved for another Store.");
      return this.describe(linkToken);
    }
    const store = await this.prisma.organization.findFirst({
      where: { id: storeId, status: OrganizationStatus.ACTIVE },
      select: { id: true },
    });
    if (!store)
      throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_LINK_STORE_INACTIVE", "An active SelfX Store is required.");
    await this.assertAvailable(storeId, session.siteUrl);
    const now = new Date();
    const claimed = await this.prisma.wooCommerceLinkSession.updateMany({
      where: { id: session.id, approvedAt: null, redeemedAt: null, expiresAt: { gt: now } },
      data: { organizationId: storeId, approvedByUserId: userId, approvedAt: now },
    });
    if (claimed.count !== 1)
      throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_LINK_INVALID", "Start a new connection request in WooCommerce.");
    return this.describe(linkToken);
  }

  async redeem(linkToken: string, redeemSecret: string): Promise<WooCommerceLinkRedeemedDto> {
    const session = await this.requireSession(linkToken);
    const supplied = Buffer.from(digest(requireToken(redeemSecret)), "hex");
    const expected = Buffer.from(session.redeemSecretHash, "hex");
    if (!timingSafeEqual(supplied, expected))
      throw failure(HttpStatus.FORBIDDEN, "WOOCOMMERCE_LINK_INVALID", "Connection request is invalid.");
    if (!session.approvedAt || !session.organizationId || !session.approvedByUserId)
      throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_LINK_PENDING", "Approve this website in SelfX first.");
    if (session.redeemedAt)
      throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_LINK_REDEEMED", "This connection has already been completed.");
    const storeId = session.organizationId;
    const approvedByUserId = session.approvedByUserId;
    const now = new Date();
    const secret = `selfx_woocommerce_${randomBytes(32).toString("base64url")}`;
    const result = await this.prisma.$transaction(async (tx) => {
      const stores = await tx.$queryRaw<Array<{ status: OrganizationStatus; name: string }>>`
        SELECT status, name FROM organizations WHERE id=${storeId}::uuid FOR UPDATE
      `;
      const store = stores[0];
      if (!store || store.status !== OrganizationStatus.ACTIVE)
        throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_LINK_STORE_INACTIVE", "An active SelfX Store is required.");
      const claimed = await tx.wooCommerceLinkSession.updateMany({
        where: { id: session.id, approvedAt: { not: null }, redeemedAt: null, expiresAt: { gt: now } },
        data: { redeemedAt: now },
      });
      if (claimed.count !== 1)
        throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_LINK_REDEEMED", "This connection has already been completed.");
      const other = await tx.integration.findFirst({
        where: { type: "WOOCOMMERCE", externalAccountId: session.siteUrl },
      });
      if (other && other.organizationId !== storeId)
        throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_SITE_ALREADY_LINKED", "This website is already linked to another SelfX Store.");
      const previous = await tx.integration.findUnique({
        where: { organizationId_type: { organizationId: storeId, type: "WOOCOMMERCE" } },
      });
      if (previous?.externalAccountId && previous.externalAccountId !== session.siteUrl && previous.status !== IntegrationStatus.DISCONNECTED)
        throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_STORE_ALREADY_LINKED", "This Store is already linked to another website.");
      const integration = await tx.integration.upsert({
        where: { organizationId_type: { organizationId: storeId, type: "WOOCOMMERCE" } },
        create: {
          id: createSelfxId(), organizationId: storeId, type: "WOOCOMMERCE",
          status: IntegrationStatus.ACTIVE, externalAccountId: session.siteUrl,
          connectedAt: now, createdByUserId: approvedByUserId,
          metadata: { connectionMode: "WOOCOMMERCE_PLUGIN" },
        },
        update: {
          status: IntegrationStatus.ACTIVE, externalAccountId: session.siteUrl,
          connectedAt: now, disconnectedAt: null,
          metadata: { connectionMode: "WOOCOMMERCE_PLUGIN" },
        },
      });
      await tx.integrationCredential.updateMany({
        where: { integrationId: integration.id, status: IntegrationCredentialStatus.ACTIVE },
        data: { status: IntegrationCredentialStatus.REVOKED, revokedAt: now },
      });
      await tx.integrationCredential.create({
        data: {
          id: createSelfxId(), integrationId: integration.id, organizationId: storeId,
          name: "SelfX WooCommerce plugin", tokenPrefix: secret.slice(0, INTEGRATION_TOKEN_PREFIX_LENGTH),
          tokenHash: hashIntegrationToken(secret), scopes: ["catalog:sync", "tryon:create"],
          status: IntegrationCredentialStatus.ACTIVE, createdByUserId: approvedByUserId,
        },
      });
      await tx.wooCommerceLinkSession.update({ where: { id: session.id }, data: { integrationId: integration.id } });
      await tx.auditLog.create({
        data: {
          id: createSelfxId(), action: "WOOCOMMERCE_PLUGIN_LINKED", actorUserId: approvedByUserId,
          organizationId: storeId, resourceType: "integration", resourceId: integration.id,
          metadata: { site_url: session.siteUrl },
        },
      });
      return { integration, storeName: store.name };
    });
    return {
      status: "LINKED", siteUrl: session.siteUrl, storeId,
      storeName: result.storeName, integrationId: result.integration.id, integrationToken: secret,
    };
  }

  private async assertAvailable(storeId: string, siteUrl: string) {
    const [siteIntegration, storeIntegration] = await Promise.all([
      this.prisma.integration.findFirst({ where: { type: "WOOCOMMERCE", externalAccountId: siteUrl } }),
      this.prisma.integration.findUnique({ where: { organizationId_type: { organizationId: storeId, type: "WOOCOMMERCE" } } }),
    ]);
    if (siteIntegration && siteIntegration.organizationId !== storeId)
      throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_SITE_ALREADY_LINKED", "This website is already linked to another SelfX Store.");
    if (storeIntegration?.externalAccountId && storeIntegration.externalAccountId !== siteUrl && storeIntegration.status !== IntegrationStatus.DISCONNECTED)
      throw failure(HttpStatus.CONFLICT, "WOOCOMMERCE_STORE_ALREADY_LINKED", "This Store is already linked to another website.");
  }

  private async requireSession(linkToken: string) {
    const session = await this.prisma.wooCommerceLinkSession.findUnique({
      where: { tokenHash: digest(requireToken(linkToken)) },
      include: { organization: { select: { name: true } } },
    });
    if (!session || session.expiresAt <= new Date())
      throw failure(HttpStatus.NOT_FOUND, "WOOCOMMERCE_LINK_INVALID", "Connection request expired or was not found.");
    return session;
  }

  private created(linkToken: string, expiresAt: Date): WooCommerceLinkCreatedDto {
    const url = this.approvalUrl(linkToken);
    return { approvalUrl: url.toString(), expiresAt: expiresAt.toISOString() };
  }

  private approvalUrl(linkToken: string): URL {
    const base = process.env.SELFX_WEB_BASE_URL?.trim();
    if (!base)
      throw failure(HttpStatus.SERVICE_UNAVAILABLE, "WOOCOMMERCE_LINK_CONFIGURATION", "SelfX connection setup is unavailable.");
    const url = new URL("/app/integrations/woocommerce/link", base);
    url.searchParams.set("token", linkToken);
    return url;
  }
}
