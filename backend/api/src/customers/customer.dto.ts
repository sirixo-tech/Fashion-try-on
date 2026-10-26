import {
  Equals,
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { CUSTOMER_TERMS_VERSION } from "./customer.config.js";
import { CUSTOMER_LANGUAGES } from "./customer-languages.js";

export class CustomerEmailDto {
  @IsEmail() @MaxLength(320) email!: string;
}
export class CustomerLoginDto extends CustomerEmailDto {
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
  @IsOptional() @IsString() @MaxLength(100) deviceName?: string;
}
export class CustomerSignupDto extends CustomerEmailDto {
  @IsOptional() @IsIn(CUSTOMER_LANGUAGES) language?: string;
  @IsString() @Matches(/\S/) @MaxLength(160) displayName!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
  @Equals(true) acceptTerms!: boolean;
  @Equals(CUSTOMER_TERMS_VERSION) termsVersion!: string;
}
export class CustomerCodeDto extends CustomerEmailDto {
  @Matches(/^\d{8}$/) code!: string;
  @IsOptional() @IsString() @MaxLength(100) deviceName?: string;
}
export class CustomerResetDto extends CustomerCodeDto {
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}
export class CustomerVerificationDto extends CustomerCodeDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/) signupProof!: string;
}
export class CustomerResendDto extends CustomerEmailDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/) signupProof!: string;
}
export class CustomerRefreshDto {
  @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) refreshToken!: string;
}
export class CustomerOAuthDto {
  @IsOptional() @IsIn(CUSTOMER_LANGUAGES) language?: string;
  @IsIn(["GOOGLE", "APPLE"]) provider!: "GOOGLE" | "APPLE";
  @IsString() @MinLength(20) @MaxLength(16384) idToken!: string;
  @IsOptional() @IsUUID() challengeId?: string;
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @Equals(true) acceptTerms?: boolean;
  @IsOptional() @Equals(CUSTOMER_TERMS_VERSION) termsVersion?: string;
  @IsOptional() @IsString() @MaxLength(100) deviceName?: string;
}
export class CustomerProfileDto {
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(160) displayName?: string;
  @IsOptional() @IsIn(CUSTOMER_LANGUAGES) language?: string;
  @IsOptional() @IsBoolean() notifications?: boolean;
}
export class CustomerDeleteDto {
  @Equals("DELETE") confirmation!: string;
  @IsOptional() @IsString() @MaxLength(128) password?: string;
  @IsOptional() @IsIn(["GOOGLE", "APPLE"]) provider?: "GOOGLE" | "APPLE";
  @IsOptional() @IsString() @MaxLength(16384) idToken?: string;
  @IsOptional() @IsUUID() challengeId?: string;
}
