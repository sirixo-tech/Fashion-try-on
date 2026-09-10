import { createHash, timingSafeEqual } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";

import { ApiErrorException } from "../common/api-error.exception.js";
import { loadShopifyLinkConfig } from "./shopify-link.config.js";

export const SHOPIFY_APP_SERVICE_AUTH_ERROR_CODES = {
  configuration: "SHOPIFY_APP_SERVICE_AUTH_CONFIGURATION_ERROR",
  unauthorized: "SHOPIFY_APP_SERVICE_AUTH_UNAUTHORIZED",
} as const;

@Injectable()
export class ShopifyAppServiceAuthService {
  requireServiceToken(candidate: string | undefined): void {
    let expected: string;
    try {
      expected = loadShopifyLinkConfig().serviceToken;
    } catch {
      throw new ApiErrorException(
        HttpStatus.SERVICE_UNAVAILABLE,
        SHOPIFY_APP_SERVICE_AUTH_ERROR_CODES.configuration,
        "Shopify app linking is not configured on this SelfX server.",
      );
    }
    if (!candidate || !secureEqual(expected, candidate.trim())) {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        SHOPIFY_APP_SERVICE_AUTH_ERROR_CODES.unauthorized,
        "Shopify app service authentication failed.",
      );
    }
  }
}

function secureEqual(left: string, right: string): boolean {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}
