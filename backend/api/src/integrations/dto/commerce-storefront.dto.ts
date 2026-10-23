import {
  Equals,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from "class-validator";
import { STOREFRONT_CONSENT_VERSION } from "../commerce-storefront-try-on.service.js";
export class WooCommerceLaunchDto {
  @IsString() @Length(1, 180) externalProductId!: string;
  @IsString() @Matches(/^[A-Za-z0-9_-]{32,128}$/) visitorToken!: string;
  @IsOptional() @IsString() @MaxLength(16) locale?: string;
}
export class WooCommerceAvailabilityDto {
  @IsString() @Length(1, 180) externalProductId!: string;
}
export class StorefrontConsentDto {
  @IsBoolean() @Equals(true) accepted!: boolean;
  @IsString() @Equals(STOREFRONT_CONSENT_VERSION) policyVersion!: string;
}
