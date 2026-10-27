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
export class CustomerLoginDto {
  @IsString()
  @MaxLength(320)
  @Matches(/^(?:[^\s@]+@[^\s@]+\.[^\s@]+|\+[1-9]\d{7,14})$/)
  email!: string;
  @IsString() @MinLength(1) @MaxLength(128) password!: string;
  @IsOptional() @IsString() @MaxLength(100) deviceName?: string;
}
export class CustomerSignupDto extends CustomerEmailDto {
  @IsOptional() @Matches(/^\+[1-9]\d{7,14}$/) phoneNumber?: string;
  @IsOptional() @IsIn(CUSTOMER_LANGUAGES) language?: string;
  @IsString() @Matches(/\S/) @MaxLength(160) displayName!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
  @Equals(true) acceptTerms!: boolean;
  @Equals(CUSTOMER_TERMS_VERSION) termsVersion!: string;
}
export class CustomerCodeDto extends CustomerEmailDto {
  @Matches(/^\d{6}$/) code!: string;
  @IsOptional() @IsString() @MaxLength(100) deviceName?: string;
}
export class CustomerResetDto extends CustomerCodeDto {
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
export class CustomerEmailLoginRequestDto extends CustomerEmailDto {
  @IsOptional() @Matches(/^[A-Za-z0-9_-]{43}$/) loginProof?: string;
}
export class CustomerEmailLoginDto extends CustomerCodeDto {
  @Matches(/^[A-Za-z0-9_-]{43}$/) loginProof!: string;
}
export class CustomerPhoneDto {
  @IsString() @MinLength(20) @MaxLength(16384) idToken!: string;
  @IsOptional() @IsString() @MaxLength(100) deviceName?: string;
}
export class CustomerPhoneRequestDto {
  @Matches(/^\+[1-9]\d{7,14}$/) phoneNumber!: string;
}
export class CustomerPhoneLinkDto extends CustomerPhoneDto {
  @Equals(true) acceptPhoneVerification!: boolean;
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
export class CustomerOAuthLinkDto {
  @IsIn(["GOOGLE"]) provider!: "GOOGLE";
  @IsString() @MinLength(20) @MaxLength(16384) idToken!: string;
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
