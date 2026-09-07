import { timingSafeEqual } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";
import {
  IntegrationCredentialStatus,
  IntegrationStatus,
  OrganizationStatus,
  type IntegrationCredential,
  type IntegrationType,
} from "@prisma/client";
import { type FastifyRequest } from "fastify";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  type IntegrationCredentialScopeDto,
  integrationCredentialScopeOptions,
} from "./dto/integration.dto.js";
import {
  INTEGRATION_TOKEN_PREFIX_LENGTH,
  hashIntegrationToken,
} from "./integrations.service.js";

export const INTEGRATION_AUTH_ERROR_CODES = {
  missingToken: "INTEGRATION_TOKEN_MISSING",
  invalidToken: "INTEGRATION_TOKEN_INVALID",
  revokedToken: "INTEGRATION_TOKEN_REVOKED",
  expiredToken: "INTEGRATION_TOKEN_EXPIRED",
  scopeDenied: "INTEGRATION_SCOPE_DENIED",
  integrationInactive: "INTEGRATION_INACTIVE",
  storeInactive: "INTEGRATION_STORE_INACTIVE",
} as const;

export interface IntegrationCredentialContext {
  credentialId: string;
  integrationId: string;
  integrationType: IntegrationType;
  tokenPrefix: string;
  storeId: string;
  storeName: string;
  externalAccountId: string | null;
  externalAccountName: string | null;
  scopes: IntegrationCredentialScopeDto[];
}

type IntegrationCredentialWithContext = IntegrationCredential & {
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

@Injectable()
export class IntegrationTokenAuthService {
  constructor(private readonly prisma: PrismaService) {}

  async verifyRequest(
    request: FastifyRequest,
    requiredScopes: readonly IntegrationCredentialScopeDto[] = [],
  ): Promise<IntegrationCredentialContext> {
    const rawToken = extractRawIntegrationToken(request);
    if (!rawToken) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        INTEGRATION_AUTH_ERROR_CODES.missingToken,
        "Integration token is required.",
      );
    }
    return this.verifyToken(rawToken, requiredScopes);
  }

  async verifyToken(
    rawToken: string,
    requiredScopes: readonly IntegrationCredentialScopeDto[] = [],
  ): Promise<IntegrationCredentialContext> {
    if (!hasValidIntegrationTokenShape(rawToken)) {
      throwInvalidToken();
    }

    const tokenPrefix = rawToken.slice(0, INTEGRATION_TOKEN_PREFIX_LENGTH);
    const tokenHash = hashIntegrationToken(rawToken);
    const credential = await this.prisma.integrationCredential.findFirst({
      where: { tokenPrefix },
      include: {
        integration: {
          select: {
            id: true,
            type: true,
            status: true,
            externalAccountId: true,
            externalAccountName: true,
            organization: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    if (!credential || !safeHashEquals(credential.tokenHash, tokenHash)) {
      throwInvalidToken();
    }
    if (
      credential.status !== IntegrationCredentialStatus.ACTIVE ||
      credential.revokedAt
    ) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        INTEGRATION_AUTH_ERROR_CODES.revokedToken,
        "Integration token has been revoked.",
      );
    }
    if (credential.expiresAt && credential.expiresAt <= new Date()) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        INTEGRATION_AUTH_ERROR_CODES.expiredToken,
        "Integration token has expired.",
      );
    }
    if (credential.integration.status !== IntegrationStatus.ACTIVE) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        INTEGRATION_AUTH_ERROR_CODES.integrationInactive,
        "Integration is not active.",
      );
    }
    if (
      credential.integration.organization.status !== OrganizationStatus.ACTIVE
    ) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        INTEGRATION_AUTH_ERROR_CODES.storeInactive,
        "Store is not active for integration access.",
      );
    }

    const scopes = cleanStoredScopes(credential.scopes);
    const missingScopes = requiredScopes.filter(
      (scope) => !scopes.includes(scope),
    );
    if (missingScopes.length > 0) {
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        INTEGRATION_AUTH_ERROR_CODES.scopeDenied,
        "Integration token does not include the required scope.",
      );
    }

    await this.prisma.integrationCredential.update({
      where: { id: credential.id },
      data: { lastUsedAt: new Date() },
    });

    return mapCredential(credential, scopes);
  }
}

function extractRawIntegrationToken(request: FastifyRequest): string | null {
  const selfxHeader = firstHeaderValue(
    request.headers["x-selfx-integration-token"],
  );
  if (selfxHeader) {
    return selfxHeader.trim();
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

function hasValidIntegrationTokenShape(rawToken: string): boolean {
  return /^selfx_(shopify|woocommerce)_[A-Za-z0-9_-]{32,}$/.test(rawToken);
}

function cleanStoredScopes(value: unknown): IntegrationCredentialScopeDto[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((scope): scope is IntegrationCredentialScopeDto =>
    integrationCredentialScopeOptions.includes(
      scope as IntegrationCredentialScopeDto,
    ),
  );
}

function safeHashEquals(storedHash: string, candidateHash: string): boolean {
  const stored = Buffer.from(storedHash, "hex");
  const candidate = Buffer.from(candidateHash, "hex");
  return (
    stored.length === candidate.length && timingSafeEqual(stored, candidate)
  );
}

function mapCredential(
  credential: IntegrationCredentialWithContext,
  scopes: IntegrationCredentialScopeDto[],
): IntegrationCredentialContext {
  return {
    credentialId: credential.id,
    integrationId: credential.integration.id,
    integrationType: credential.integration.type,
    tokenPrefix: credential.tokenPrefix,
    storeId: credential.integration.organization.id,
    storeName: credential.integration.organization.name,
    externalAccountId: credential.integration.externalAccountId,
    externalAccountName: credential.integration.externalAccountName,
    scopes,
  };
}

function throwInvalidToken(): never {
  throw new ApiErrorException(
    HttpStatus.UNAUTHORIZED,
    INTEGRATION_AUTH_ERROR_CODES.invalidToken,
    "Integration token is invalid.",
  );
}
