import { createHash, randomBytes } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import {
  IntegrationCredentialStatus,
  IntegrationStatus,
  OrganizationStatus,
  Prisma,
  type IntegrationType,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type CreateIntegrationCredentialDto,
  type CreateIntegrationCredentialResponseDto,
  type IntegrationCredentialDto,
  type IntegrationCredentialScopeDto,
  type IntegrationDto,
  type IntegrationListQueryDto,
  type IntegrationListResponseDto,
  type IntegrationTypeDto,
  type UpsertIntegrationDto,
  integrationCredentialScopeOptions,
  integrationTypeOptions,
} from "./dto/integration.dto.js";

export const INTEGRATIONS_ERROR_CODES = {
  storeNotFound: "INTEGRATION_STORE_NOT_FOUND",
  integrationNotFound: "INTEGRATION_NOT_FOUND",
  credentialNotFound: "INTEGRATION_CREDENTIAL_NOT_FOUND",
  integrationTypeInvalid: "INTEGRATION_TYPE_INVALID",
  credentialNameRequired: "INTEGRATION_CREDENTIAL_NAME_REQUIRED",
  credentialScopeInvalid: "INTEGRATION_CREDENTIAL_SCOPE_INVALID",
  credentialAlreadyRevoked: "INTEGRATION_CREDENTIAL_ALREADY_REVOKED",
} as const;

const INTEGRATION_AUDIT_ACTIONS = {
  connected: "INTEGRATION_CONNECTED",
  disconnected: "INTEGRATION_DISCONNECTED",
  credentialCreated: "INTEGRATION_CREDENTIAL_CREATED",
  credentialRevoked: "INTEGRATION_CREDENTIAL_REVOKED",
} as const;

const defaultPage = 1;
const defaultPageSize = 25;
const maxPageSize = 100;
export const INTEGRATION_TOKEN_PREFIX_LENGTH = 32;

const credentialInclude =
  Prisma.validator<Prisma.IntegrationCredentialInclude>()({
    createdByUser: { select: { email: true } },
  });

const integrationInclude = Prisma.validator<Prisma.IntegrationInclude>()({
  organization: { select: { id: true, name: true } },
  credentials: {
    include: credentialInclude,
    orderBy: [{ createdAt: "desc" }],
  },
});

type IntegrationCredentialWithUser = Prisma.IntegrationCredentialGetPayload<{
  include: typeof credentialInclude;
}>;

type IntegrationWithRelations = Prisma.IntegrationGetPayload<{
  include: typeof integrationInclude;
}>;

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listIntegrations(
    query: IntegrationListQueryDto,
  ): Promise<IntegrationListResponseDto> {
    const page = boundedPositiveInt(query.page, defaultPage);
    const pageSize = Math.min(
      boundedPositiveInt(query.pageSize, defaultPageSize),
      maxPageSize,
    );
    const where: Prisma.IntegrationWhereInput = {
      ...(query.storeId ? { organizationId: query.storeId } : {}),
      ...(query.type ? { type: cleanIntegrationType(query.type) } : {}),
    };
    const [total, integrations] = await Promise.all([
      this.prisma.integration.count({ where }),
      this.prisma.integration.findMany({
        where,
        include: integrationInclude,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: integrations.map(mapIntegration),
      pagination: pagination(page, pageSize, total),
    };
  }

  async upsertIntegration(
    actorUserId: string,
    input: UpsertIntegrationDto,
  ): Promise<IntegrationDto> {
    await this.assertActiveStore(input.storeId);
    const type = cleanIntegrationType(input.type);
    const now = new Date();
    const integration = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.integration.upsert({
        where: {
          organizationId_type: {
            organizationId: input.storeId,
            type,
          },
        },
        create: {
          id: createSelfxId(),
          organizationId: input.storeId,
          type,
          status: IntegrationStatus.ACTIVE,
          externalAccountId: nullableTrim(input.externalAccountId),
          externalAccountName: nullableTrim(input.externalAccountName),
          connectedAt: now,
          disconnectedAt: null,
          createdByUserId: actorUserId,
        },
        update: {
          status: IntegrationStatus.ACTIVE,
          externalAccountId: nullableTrim(input.externalAccountId),
          externalAccountName: nullableTrim(input.externalAccountName),
          connectedAt: now,
          disconnectedAt: null,
        },
        include: integrationInclude,
      });
      await createAudit(tx, {
        action: INTEGRATION_AUDIT_ACTIONS.connected,
        actorUserId,
        storeId: input.storeId,
        resourceType: "integration",
        resourceId: saved.id,
        metadata: {
          type,
          external_account_id: nullableTrim(input.externalAccountId),
          external_account_name: nullableTrim(input.externalAccountName),
        },
      });
      return saved;
    });

    return mapIntegration(integration);
  }

  async disconnectIntegration(
    actorUserId: string,
    integrationId: string,
  ): Promise<IntegrationDto> {
    const current = await this.requireIntegration(integrationId);
    const now = new Date();
    const disconnected = await this.prisma.$transaction(async (tx) => {
      await tx.integrationProviderCredential.deleteMany({
        where: { integrationId },
      });
      await tx.integrationOauthState.deleteMany({
        where: {
          organizationId: current.organizationId,
          provider: current.type,
          consumedAt: null,
        },
      });
      await tx.integrationCredential.updateMany({
        where: {
          integrationId,
          status: IntegrationCredentialStatus.ACTIVE,
        },
        data: {
          status: IntegrationCredentialStatus.REVOKED,
          revokedAt: now,
        },
      });
      const updated = await tx.integration.update({
        where: { id: integrationId },
        data: {
          status: IntegrationStatus.DISCONNECTED,
          disconnectedAt: now,
        },
        include: integrationInclude,
      });
      await createAudit(tx, {
        action: INTEGRATION_AUDIT_ACTIONS.disconnected,
        actorUserId,
        storeId: current.organizationId,
        resourceType: "integration",
        resourceId: integrationId,
        metadata: { type: current.type },
      });
      return updated;
    });

    return mapIntegration(disconnected);
  }

  async createCredential(
    actorUserId: string,
    integrationId: string,
    input: CreateIntegrationCredentialDto,
  ): Promise<CreateIntegrationCredentialResponseDto> {
    const name = input.name.trim();
    if (!name) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        INTEGRATIONS_ERROR_CODES.credentialNameRequired,
        "Integration credential name is required.",
      );
    }
    const integration = await this.requireIntegration(integrationId);
    if (integration.status !== IntegrationStatus.ACTIVE) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        INTEGRATIONS_ERROR_CODES.integrationNotFound,
        "Active integration was not found.",
      );
    }
    await this.assertActiveStore(integration.organizationId);
    const scopes = cleanCredentialScopes(input.scopes);
    const expiresAt = cleanExpiresAt(input.expiresAt);
    const secret = createRawIntegrationToken(integration.type);
    const tokenPrefix = secret.slice(0, INTEGRATION_TOKEN_PREFIX_LENGTH);
    const tokenHash = hashIntegrationToken(secret);

    const credential = await this.prisma.$transaction(async (tx) => {
      const created = await tx.integrationCredential.create({
        data: {
          id: createSelfxId(),
          integrationId,
          organizationId: integration.organizationId,
          name,
          tokenPrefix,
          tokenHash,
          scopes: scopes satisfies Prisma.InputJsonArray,
          status: IntegrationCredentialStatus.ACTIVE,
          expiresAt,
          createdByUserId: actorUserId,
        },
        include: credentialInclude,
      });
      await createAudit(tx, {
        action: INTEGRATION_AUDIT_ACTIONS.credentialCreated,
        actorUserId,
        storeId: integration.organizationId,
        resourceType: "integration_credential",
        resourceId: created.id,
        metadata: {
          integration_id: integrationId,
          type: integration.type,
          token_prefix: tokenPrefix,
          scopes,
          expires_at: expiresAt?.toISOString() ?? null,
        },
      });
      return created;
    });

    return { credential: mapCredential(credential), secret };
  }

  async integrationStoreId(integrationId: string): Promise<string> {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
      select: { organizationId: true },
    });
    if (!integration) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        INTEGRATIONS_ERROR_CODES.integrationNotFound,
        "Integration was not found.",
      );
    }
    return integration.organizationId;
  }

  async credentialStoreId(credentialId: string): Promise<string> {
    const credential = await this.prisma.integrationCredential.findUnique({
      where: { id: credentialId },
      select: { organizationId: true },
    });
    if (!credential) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        INTEGRATIONS_ERROR_CODES.credentialNotFound,
        "Integration credential was not found.",
      );
    }
    return credential.organizationId;
  }

  async revokeCredential(
    actorUserId: string,
    credentialId: string,
  ): Promise<IntegrationCredentialDto> {
    const current = await this.prisma.integrationCredential.findUnique({
      where: { id: credentialId },
      include: { integration: { select: { type: true } } },
    });
    if (!current) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        INTEGRATIONS_ERROR_CODES.credentialNotFound,
        "Integration credential was not found.",
      );
    }
    if (current.status === IntegrationCredentialStatus.REVOKED) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        INTEGRATIONS_ERROR_CODES.credentialAlreadyRevoked,
        "Integration credential is already revoked.",
      );
    }

    const revoked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.integrationCredential.update({
        where: { id: credentialId },
        data: {
          status: IntegrationCredentialStatus.REVOKED,
          revokedAt: new Date(),
        },
        include: credentialInclude,
      });
      await createAudit(tx, {
        action: INTEGRATION_AUDIT_ACTIONS.credentialRevoked,
        actorUserId,
        storeId: current.organizationId,
        resourceType: "integration_credential",
        resourceId: credentialId,
        metadata: {
          integration_id: current.integrationId,
          type: current.integration.type,
          token_prefix: current.tokenPrefix,
        },
      });
      return updated;
    });

    return mapCredential(revoked);
  }

  private async requireIntegration(
    integrationId: string,
  ): Promise<IntegrationWithRelations> {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
      include: integrationInclude,
    });
    if (!integration) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        INTEGRATIONS_ERROR_CODES.integrationNotFound,
        "Integration was not found.",
      );
    }
    return integration;
  }

  private async assertActiveStore(storeId: string): Promise<void> {
    const store = await this.prisma.organization.findUnique({
      where: { id: storeId },
      select: { id: true, status: true },
    });
    if (!store || store.status !== OrganizationStatus.ACTIVE) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        INTEGRATIONS_ERROR_CODES.storeNotFound,
        "Active Store was not found.",
      );
    }
  }
}

function createRawIntegrationToken(type: IntegrationType): string {
  return `selfx_${type.toLowerCase()}_${randomBytes(32).toString("base64url")}`;
}

export function hashIntegrationToken(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function cleanIntegrationType(value: string): IntegrationType {
  if (integrationTypeOptions.includes(value as IntegrationTypeDto)) {
    return value as IntegrationType;
  }
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    INTEGRATIONS_ERROR_CODES.integrationTypeInvalid,
    "Integration type is invalid.",
  );
}

function cleanCredentialScopes(
  scopes: readonly string[],
): IntegrationCredentialScopeDto[] {
  const uniqueScopes = [...new Set(scopes)];
  if (
    uniqueScopes.length === 0 ||
    uniqueScopes.some(
      (scope) =>
        !integrationCredentialScopeOptions.includes(
          scope as IntegrationCredentialScopeDto,
        ),
    )
  ) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      INTEGRATIONS_ERROR_CODES.credentialScopeInvalid,
      "One or more integration credential scopes are invalid.",
    );
  }
  return uniqueScopes as IntegrationCredentialScopeDto[];
}

function cleanExpiresAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapIntegration(integration: IntegrationWithRelations): IntegrationDto {
  return {
    id: integration.id,
    storeId: integration.organization.id,
    storeName: integration.organization.name,
    type: integration.type,
    status: integration.status,
    externalAccountId: integration.externalAccountId,
    externalAccountName: integration.externalAccountName,
    connectedAt: integration.connectedAt?.toISOString() ?? null,
    disconnectedAt: integration.disconnectedAt?.toISOString() ?? null,
    credentials: integration.credentials.map(mapCredential),
    createdAt: integration.createdAt.toISOString(),
    updatedAt: integration.updatedAt.toISOString(),
  };
}

function mapCredential(
  credential: IntegrationCredentialWithUser,
): IntegrationCredentialDto {
  return {
    id: credential.id,
    integrationId: credential.integrationId,
    name: credential.name,
    tokenPrefix: credential.tokenPrefix,
    scopes: Array.isArray(credential.scopes)
      ? credential.scopes.filter(
          (scope): scope is IntegrationCredentialScopeDto =>
            integrationCredentialScopeOptions.includes(
              scope as IntegrationCredentialScopeDto,
            ),
        )
      : [],
    status:
      credential.status === IntegrationCredentialStatus.REVOKED
        ? "REVOKED"
        : "ACTIVE",
    expiresAt: credential.expiresAt?.toISOString() ?? null,
    lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
    createdByEmail: credential.createdByUser.email,
    createdAt: credential.createdAt.toISOString(),
    revokedAt: credential.revokedAt?.toISOString() ?? null,
  };
}

function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    hasMore: page * pageSize < total,
  };
}

function boundedPositiveInt(
  value: number | undefined,
  fallback: number,
): number {
  if (!value || !Number.isFinite(value) || value < 1) {
    return fallback;
  }
  return Math.floor(value);
}

function nullableTrim(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function createAudit(
  prisma: Pick<Prisma.TransactionClient, "auditLog">,
  input: {
    action: string;
    actorUserId: string;
    storeId: string;
    resourceType: string;
    resourceId: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await prisma.auditLog.create({
    data: {
      id: createSelfxId(),
      action: input.action,
      actorUserId: input.actorUserId,
      organizationId: input.storeId,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata,
    },
  });
}
