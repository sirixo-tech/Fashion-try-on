import { HttpStatus, Injectable } from "@nestjs/common";
import { IntegrationType, Prisma } from "@prisma/client";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import type {
  IntegrationShopifySettingsDto,
  UpdateIntegrationShopifySettingsDto,
} from "./dto/integration-settings.dto.js";
import type { IntegrationCredentialContext } from "./integration-token-auth.service.js";

export const INTEGRATION_SETTINGS_ERROR_CODES = {
  unsupportedIntegration: "INTEGRATION_SETTINGS_UNSUPPORTED",
  integrationNotFound: "INTEGRATION_SETTINGS_NOT_FOUND",
} as const;

@Injectable()
export class IntegrationSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async updateShopifySettings(
    credential: IntegrationCredentialContext,
    input: UpdateIntegrationShopifySettingsDto,
  ): Promise<IntegrationShopifySettingsDto> {
    if (credential.integrationType !== IntegrationType.SHOPIFY) {
      throw new ApiErrorException(
        HttpStatus.BAD_REQUEST,
        INTEGRATION_SETTINGS_ERROR_CODES.unsupportedIntegration,
        "Shopify settings can only be updated by a Shopify integration.",
      );
    }
    const integration = await this.prisma.integration.findFirst({
      where: {
        id: credential.integrationId,
        organizationId: credential.storeId,
        type: IntegrationType.SHOPIFY,
      },
      select: { id: true, metadata: true },
    });
    if (!integration) {
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        INTEGRATION_SETTINGS_ERROR_CODES.integrationNotFound,
        "The Shopify integration was not found.",
      );
    }
    const metadata = jsonObject(integration.metadata);
    await this.prisma.integration.update({
      where: { id: integration.id },
      data: {
        metadata: {
          ...metadata,
          tryOnMode: input.tryOnMode,
        },
      },
    });
    return { tryOnMode: input.tryOnMode };
  }
}

function jsonObject(value: Prisma.JsonValue | null): Prisma.InputJsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Prisma.InputJsonObject)
    : {};
}
