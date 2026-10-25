import { type Prisma } from "@prisma/client";
import { type PrismaService } from "../database/prisma.service.js";
import {
  type WooCommerceOverviewQueryDto,
  type WooCommerceOverviewResponse,
} from "./dto/woocommerce-overview.dto.js";

// Only this receipt is exposed; integration metadata can contain private link state.
export function catalogSyncReceipt(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const value = (metadata as Record<string, unknown>).lastCatalogSyncAt;
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

export async function wooCommerceOverview(
  prisma: PrismaService,
  query: WooCommerceOverviewQueryDto,
): Promise<WooCommerceOverviewResponse> {
  const page = Math.max(1, Math.floor(query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(query.pageSize || 20)));
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const connected: Prisma.IntegrationWhereInput = {
    status: "ACTIVE",
    organization: { status: "ACTIVE" },
    credentials: {
      some: {
        status: "ACTIVE",
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: to } }],
      },
    },
  };
  const attention: Prisma.IntegrationWhereInput = {
    status: { not: "DISCONNECTED" },
    NOT: connected,
  };
  const search = query.search?.trim();
  const base: Prisma.IntegrationWhereInput = {
    type: "WOOCOMMERCE",
    ...(query.storeId ? { organizationId: query.storeId } : {}),
    ...(search
      ? {
          OR: [
            {
              organization: { name: { contains: search, mode: "insensitive" } },
            },
            { externalAccountId: { contains: search, mode: "insensitive" } },
            { externalAccountName: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const where: Prisma.IntegrationWhereInput = {
    AND: [
      base,
      query.health === "CONNECTED"
        ? connected
        : query.health === "NEEDS_ATTENTION"
          ? attention
          : query.health === "DISCONNECTED"
            ? { status: "DISCONNECTED" }
            : {},
    ],
  };
  const usageWhere: Prisma.BillableGenerationWhereInput = {
    channel: "WOOCOMMERCE",
    completedAt: { gte: from, lt: to },
    organization: { integrations: { some: where } },
  };
  const [
    total,
    connectedCount,
    needsAttention,
    disconnected,
    successfulTryOns,
    rows,
  ] = await Promise.all([
    prisma.integration.count({ where }),
    prisma.integration.count({ where: { AND: [where, connected] } }),
    prisma.integration.count({ where: { AND: [where, attention] } }),
    prisma.integration.count({
      where: { AND: [where, { status: "DISCONNECTED" }] },
    }),
    prisma.billableGeneration.count({ where: usageWhere }),
    prisma.integration.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ organization: { name: "asc" } }, { id: "asc" }],
      select: {
        id: true,
        organizationId: true,
        externalAccountId: true,
        externalAccountName: true,
        status: true,
        metadata: true,
        organization: { select: { name: true, status: true } },
        credentials: {
          where: {
            status: "ACTIVE",
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: to } }],
          },
          select: { id: true },
          take: 1,
        },
      },
    }),
  ]);
  const [products, usage] = rows.length
    ? await Promise.all([
        prisma.externalProductMapping.groupBy({
          by: ["integrationId"],
          where: {
            integrationId: { in: rows.map((row) => row.id) },
            status: "ACTIVE",
            externalVariantId: null,
            product: { active: true },
          },
          _count: { _all: true },
        }),
        prisma.billableGeneration.groupBy({
          by: ["organizationId"],
          where: {
            ...usageWhere,
            organizationId: { in: rows.map((row) => row.organizationId) },
          },
          _count: { _all: true },
        }),
      ])
    : [[], []];
  return {
    data: rows.map((row) => {
      const healthReasons: string[] = [];
      if (row.status === "ERROR")
        healthReasons.push("CENTRAL_INTEGRATION_ERROR");
      if (row.organization.status !== "ACTIVE")
        healthReasons.push(`SELFX_STORE_${row.organization.status}`);
      if (!row.credentials.length)
        healthReasons.push("INTEGRATION_CREDENTIAL_MISSING");
      return {
        id: row.id,
        storeId: row.organizationId,
        storeName: row.organization.name,
        website: row.externalAccountId,
        externalAccountName: row.externalAccountName,
        health:
          row.status === "DISCONNECTED"
            ? "DISCONNECTED"
            : healthReasons.length
              ? "NEEDS_ATTENTION"
              : "CONNECTED",
        healthReasons:
          row.status === "DISCONNECTED"
            ? ["CENTRAL_INTEGRATION_DISCONNECTED"]
            : healthReasons,
        productCount:
          products.find((product) => product.integrationId === row.id)?._count
            ._all ?? 0,
        successfulTryOns:
          usage.find((item) => item.organizationId === row.organizationId)
            ?._count._all ?? 0,
        lastCatalogSyncAt: catalogSyncReceipt(row.metadata),
      };
    }),
    summary: {
      total,
      connected: connectedCount,
      needsAttention,
      disconnected,
      successfulTryOns,
    },
    period: { from: from.toISOString(), to: to.toISOString(), days: 30 },
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasMore: page * pageSize < total,
    },
  };
}
