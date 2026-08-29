import { timingSafeEqual } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import { OrganizationStatus, type ApiKey } from "@prisma/client";
import { type FastifyRequest } from "fastify";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  DEVELOPER_API_KEY_PREFIX_LENGTH,
  hashApiKeySecret,
} from "./developer-api-key.service.js";
import {
  type ApiKeyEnvironment,
  type ApiKeyScope,
  apiKeyEnvironmentOptions,
  apiKeyScopeOptions,
} from "./dto/developer-api-key.dto.js";

export const PUBLIC_API_AUTH_ERROR_CODES = {
  missingKey: "PUBLIC_API_KEY_MISSING",
  invalidKey: "PUBLIC_API_KEY_INVALID",
  revokedKey: "PUBLIC_API_KEY_REVOKED",
  expiredKey: "PUBLIC_API_KEY_EXPIRED",
  scopeDenied: "PUBLIC_API_SCOPE_DENIED",
  storeInactive: "PUBLIC_API_STORE_INACTIVE",
} as const;

export interface PublicApiCredentialContext {
  apiKeyId: string;
  keyPrefix: string;
  storeId: string;
  storeName: string;
  environment: ApiKeyEnvironment;
  scopes: ApiKeyScope[];
}

type ApiKeyWithStore = ApiKey & {
  organization: {
    id: string;
    name: string;
    status: OrganizationStatus;
  };
};

@Injectable()
export class PublicApiKeyAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyRequest(
    request: FastifyRequest,
    requiredScopes: readonly ApiKeyScope[] = [],
  ): Promise<PublicApiCredentialContext> {
    const rawKey = extractRawApiKey(request);
    if (!rawKey) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        PUBLIC_API_AUTH_ERROR_CODES.missingKey,
        "Public API key is required.",
      );
    }
    return this.verifyApiKey(rawKey, requiredScopes);
  }

  async verifyApiKey(
    rawKey: string,
    requiredScopes: readonly ApiKeyScope[] = [],
  ): Promise<PublicApiCredentialContext> {
    if (!hasValidPublicApiKeyShape(rawKey)) {
      throwInvalidKey();
    }

    const keyPrefix = rawKey.slice(0, DEVELOPER_API_KEY_PREFIX_LENGTH);
    const secretHash = hashApiKeySecret(rawKey);
    const apiKey = await this.prisma.apiKey.findFirst({
      where: { keyPrefix },
      include: {
        organization: { select: { id: true, name: true, status: true } },
      },
    });

    if (!apiKey || !safeHashEquals(apiKey.secretHash, secretHash)) {
      throwInvalidKey();
    }
    if (apiKey.status !== "ACTIVE" || apiKey.revokedAt) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        PUBLIC_API_AUTH_ERROR_CODES.revokedKey,
        "Public API key has been revoked.",
      );
    }
    if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        PUBLIC_API_AUTH_ERROR_CODES.expiredKey,
        "Public API key has expired.",
      );
    }
    if (apiKey.organization.status !== OrganizationStatus.ACTIVE) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        PUBLIC_API_AUTH_ERROR_CODES.storeInactive,
        "Store is not active for Public API access.",
      );
    }

    const scopes = cleanStoredScopes(apiKey.scopes);
    const missingScopes = requiredScopes.filter(
      (scope) => !scopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        PUBLIC_API_AUTH_ERROR_CODES.scopeDenied,
        "Public API key does not include the required scope.",
      );
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });

    return mapCredential(apiKey, scopes);
  }
}

function extractRawApiKey(request: FastifyRequest): string | null {
  const selfxHeader = firstHeaderValue(request.headers["x-selfx-api-key"]);
  if (selfxHeader) {
    return selfxHeader.trim();
  }

  const genericHeader = firstHeaderValue(request.headers["x-api-key"]);
  if (genericHeader) {
    return genericHeader.trim();
  }

  const authorization = firstHeaderValue(request.headers.authorization);
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer?.trim() || null;
}

function firstHeaderValue(
  value: string | string[] | number | undefined,
): string | null {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }
  return typeof value === "string" ? value : null;
}

function hasValidPublicApiKeyShape(rawKey: string): boolean {
  return /^selfx_(test|live)_[A-Za-z0-9_-]{32,}$/.test(rawKey);
}

function cleanStoredScopes(value: unknown): ApiKeyScope[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((scope): scope is ApiKeyScope =>
    apiKeyScopeOptions.includes(scope as ApiKeyScope),
  );
}

function cleanEnvironment(value: string): ApiKeyEnvironment {
  if (apiKeyEnvironmentOptions.includes(value as ApiKeyEnvironment)) {
    return value as ApiKeyEnvironment;
  }
  throwInvalidKey();
}

function safeHashEquals(storedHash: string, candidateHash: string): boolean {
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  return (
    stored.length === candidate.length && timingSafeEqual(stored, candidate)
  );
}

function mapCredential(
  apiKey: ApiKeyWithStore,
  scopes: ApiKeyScope[],
): PublicApiCredentialContext {
  return {
    apiKeyId: apiKey.id,
    keyPrefix: apiKey.keyPrefix,
    storeId: apiKey.organization.id,
    storeName: apiKey.organization.name,
    environment: cleanEnvironment(apiKey.environment),
    scopes,
  };
}

function throwInvalidKey(): never {
  throw new ApiErrorException(
    HttpStatus.UNAUTHORIZED,
    PUBLIC_API_AUTH_ERROR_CODES.invalidKey,
    "Public API key is invalid.",
  );
}
