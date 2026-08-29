import { createHash, randomBytes } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import { OrganizationStatus, Prisma, type ApiKey } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type ApiKeyEnvironment,
  type ApiKeyScope,
  type CreateDeveloperApiKeyDto,
  type DeveloperApiKeyDto,
  type DeveloperApiKeyListQueryDto,
  type DeveloperApiKeyListResponseDto,
  apiKeyEnvironmentOptions,
  apiKeyScopeOptions,
} from "./dto/developer-api-key.dto.js";

export const DEVELOPER_API_ERROR_CODES = {
  storeRequired: "DEVELOPER_API_STORE_REQUIRED",
  storeNotFound: "DEVELOPER_API_STORE_NOT_FOUND",
  keyNotFound: "DEVELOPER_API_KEY_NOT_FOUND",
  keyNameRequired: "DEVELOPER_API_KEY_NAME_REQUIRED",
  keyScopeInvalid: "DEVELOPER_API_KEY_SCOPE_INVALID",
  keyEnvironmentInvalid: "DEVELOPER_API_KEY_ENVIRONMENT_INVALID",
  keyAlreadyRevoked: "DEVELOPER_API_KEY_ALREADY_REVOKED",
} as const;

const DEVELOPER_API_AUDIT_ACTIONS = {
  keyCreated: "DEVELOPER_API_KEY_CREATED",
  keyRevoked: "DEVELOPER_API_KEY_REVOKED",
} as const;

export const DEVELOPER_API_KEY_PREFIX_LENGTH = 24;

const defaultPage = 1;
const defaultPageSize = 25;
const maxPageSize = 100;

type ApiKeyWithRelations = ApiKey & {
  organization: { id: string; name: string };
  createdByUser: { email: string };
};

@Injectable()
export class DeveloperApiKeyService {
  constructor(private readonly prisma: PrismaService) {}

  async listKeys(
    query: DeveloperApiKeyListQueryDto,
  ): Promise<DeveloperApiKeyListResponseDto> {
    const page = boundedPositiveInt(query.page, defaultPage);
    const pageSize = Math.min(
      boundedPositiveInt(query.pageSize, defaultPageSize),
      maxPageSize,
    );
    const where: Prisma.ApiKeyWhereInput = query.storeId
      ? { organizationId: query.storeId }
      : {};
    const [total, keys] = await Promise.all([
      this.prisma.apiKey.count({ where }),
      this.prisma.apiKey.findMany({
        where,
        include: apiKeyInclude(),
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: keys.map(mapApiKey),
      pagination: pagination(page, pageSize, total),
    };
  }

  async createKey(actorUserId: string, input: CreateDeveloperApiKeyDto) {
    const name = input.name.trim();
    if (!name) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        DEVELOPER_API_ERROR_CODES.keyNameRequired,
        "API key name is required.",
      );
    }

    const environment = cleanEnvironment(input.environment);
    const scopes = cleanScopes(input.scopes);
    const expiresAt = cleanExpiresAt(input.expiresAt);
    await this.assertActiveStore(input.storeId);

    const secret = createRawApiKey(environment);
    const keyPrefix = secret.slice(0, DEVELOPER_API_KEY_PREFIX_LENGTH);
    const secretHash = hashApiKeySecret(secret);

    const apiKey = await this.prisma.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          id: createSelfxId(),
          organizationId: input.storeId,
          name,
          keyPrefix,
          secretHash,
          environment,
          status: "ACTIVE",
          scopes: scopes satisfies Prisma.InputJsonArray,
          expiresAt,
          createdByUserId: actorUserId,
        },
        include: apiKeyInclude(),
      });
      await createAudit(tx, {
        action: DEVELOPER_API_AUDIT_ACTIONS.keyCreated,
        actorUserId,
        storeId: input.storeId,
        resourceId: created.id,
        metadata: {
          name,
          key_prefix: keyPrefix,
          environment,
          scopes,
          expires_at: expiresAt?.toISOString() ?? null,
        },
      });
      return created;
    });

    return { apiKey: mapApiKey(apiKey), secret };
  }

  async storeIdForKey(keyId: string): Promise<string> {
    const key = await this.prisma.apiKey.findUnique({
      where: { id: keyId },
      select: { organizationId: true },
    });
    if (!key) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        DEVELOPER_API_ERROR_CODES.keyNotFound,
        "Developer API key was not found.",
      );
    }
    return key.organizationId;
  }

  async revokeKey(
    actorUserId: string,
    keyId: string,
  ): Promise<DeveloperApiKeyDto> {
    const current = await this.prisma.apiKey.findUnique({
      where: { id: keyId },
      select: { id: true, organizationId: true, status: true },
    });
    if (!current) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        DEVELOPER_API_ERROR_CODES.keyNotFound,
        "Developer API key was not found.",
      );
    }
    if (current.status === "REVOKED") {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        DEVELOPER_API_ERROR_CODES.keyAlreadyRevoked,
        "Developer API key is already revoked.",
      );
    }

    const revoked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.apiKey.update({
        where: { id: keyId },
        data: { status: "REVOKED", revokedAt: new Date() },
        include: apiKeyInclude(),
      });
      await createAudit(tx, {
        action: DEVELOPER_API_AUDIT_ACTIONS.keyRevoked,
        actorUserId,
        storeId: current.organizationId,
        resourceId: keyId,
        metadata: {
          key_prefix: updated.keyPrefix,
          environment: updated.environment,
        },
      });
      return updated;
    });

    return mapApiKey(revoked);
  }

  private async assertActiveStore(storeId: string): Promise<void> {
    const store = await this.prisma.organization.findUnique({
      where: { id: storeId },
      select: { id: true, status: true },
    });
    if (!store || store.status !== OrganizationStatus.ACTIVE) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        DEVELOPER_API_ERROR_CODES.storeNotFound,
        "Active Store was not found.",
      );
    }
  }
}

function createRawApiKey(environment: ApiKeyEnvironment): string {
  return `selfx_${environment.toLowerCase()}_${randomBytes(32).toString(
    "base64url",
  )}`;
}

export function hashApiKeySecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function cleanEnvironment(value: string): ApiKeyEnvironment {
  if (apiKeyEnvironmentOptions.includes(value as ApiKeyEnvironment)) {
    return value as ApiKeyEnvironment;
  }
  throw new ApiErrorException(
    HttpStatus.BAD_REQUEST,
    DEVELOPER_API_ERROR_CODES.keyEnvironmentInvalid,
    "API key environment is invalid.",
  );
}

function cleanScopes(scopes: readonly string[]): ApiKeyScope[] {
  const uniqueScopes = [...new Set(scopes)];
  if (
    uniqueScopes.length === 0 ||
    uniqueScopes.some(
      (scope) => !apiKeyScopeOptions.includes(scope as ApiKeyScope),
    )
  ) {
    throw new ApiErrorException(
      HttpStatus.BAD_REQUEST,
      DEVELOPER_API_ERROR_CODES.keyScopeInvalid,
      "One or more API key scopes are invalid.",
    );
  }
  return uniqueScopes as ApiKeyScope[];
}

function cleanExpiresAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function apiKeyInclude() {
  return {
    organization: { select: { id: true, name: true } },
    createdByUser: { select: { email: true } },
  } as const;
}

function mapApiKey(key: ApiKeyWithRelations): DeveloperApiKeyDto {
  return {
    id: key.id,
    storeId: key.organization.id,
    storeName: key.organization.name,
    name: key.name,
    keyPrefix: key.keyPrefix,
    environment: cleanEnvironment(key.environment),
    status: key.status === "REVOKED" ? "REVOKED" : "ACTIVE",
    scopes: Array.isArray(key.scopes)
      ? key.scopes.filter((scope): scope is ApiKeyScope =>
          apiKeyScopeOptions.includes(scope as ApiKeyScope),
        )
      : [],
    expiresAt: key.expiresAt?.toISOString() ?? null,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    createdByEmail: key.createdByUser.email,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() ?? null,
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

async function createAudit(
  prisma: Pick<Prisma.TransactionClient, "auditLog">,
  input: {
    action: string;
    actorUserId: string;
    storeId: string;
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
      resourceType: "api_key",
      resourceId: input.resourceId,
      metadata: input.metadata,
    },
  });
}
