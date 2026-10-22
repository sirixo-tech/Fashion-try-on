import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";
import {
  PAYMENT_ENVIRONMENTS,
  PAYMENT_PROVIDERS,
  type PaymentEnvironment,
  type PaymentProvider,
} from "./payment-gateways.js";

export class PaymentRevisionDto {
  @ApiProperty() @IsInt() @Min(0) @Max(2_000_000_000) expectedVersion!: number;
}
export class UpdateGatewayPolicyDto extends PaymentRevisionDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
}
export class PhonePeConnectionFieldsDto extends PaymentRevisionDto {
  @ApiPropertyOptional({
    description:
      "Store administrator confirms Dynamic QR access for the selected environment. Checkout also requires platform policy and server enablement.",
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  dqrAccessConfirmed?: boolean;
  @ApiProperty({ enum: PAYMENT_ENVIRONMENTS })
  @IsIn(PAYMENT_ENVIRONMENTS)
  environment!: PaymentEnvironment;
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{1,100}$/) merchantId!: string;
  @ApiPropertyOptional()
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[A-Za-z0-9_-]{1,100}$/)
  providerId?: string;
  @ApiPropertyOptional({
    description:
      "Optional merchant-side Store reference; otherwise generated from the SelfX Store ID.",
  })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^[A-Za-z0-9_-]{1,37}$/)
  providerStoreId?: string;
  @ApiProperty() @Matches(/^[0-9]{1,10}$/) saltIndex!: string;
}
export class SavePhonePeConnectionDto extends PhonePeConnectionFieldsDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  @Matches(/^\S+$/)
  saltKey!: string;
}
export class EditPhonePeConnectionDto extends PhonePeConnectionFieldsDto {
  @ApiPropertyOptional({
    writeOnly: true,
    description: "Omit or leave blank to retain the saved Salt Key.",
  })
  @ValidateIf((_object, value) => value !== undefined && value !== "")
  @IsString()
  @MinLength(16)
  @MaxLength(256)
  @Matches(/^\S+$/)
  saltKey?: string;
}
export class PhonePeConnectionEditDto {
  @ApiProperty() version!: number;
  @ApiProperty({ enum: PAYMENT_ENVIRONMENTS }) environment!: PaymentEnvironment;
  @ApiProperty() merchantId!: string;
  @ApiPropertyOptional() providerId?: string;
  @ApiProperty() providerStoreId!: string;
  @ApiProperty() saltIndex!: string;
  @ApiProperty() dqrAccessConfirmed!: boolean;
  @ApiProperty({ enum: [true] }) saltKeyConfigured!: true;
}
export class SelectPaymentGatewayDto extends PaymentRevisionDto {
  @ApiProperty({ enum: PAYMENT_PROVIDERS, nullable: true })
  @ValidateIf((_object, value) => value !== null)
  @IsIn(PAYMENT_PROVIDERS)
  provider!: PaymentProvider | null;
}
export class PaymentGatewayDto {
  @ApiProperty({ enum: PAYMENT_PROVIDERS }) provider!: string;
  @ApiProperty() name!: string;
  @ApiProperty() setupAvailable!: boolean;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() version!: number;
  @ApiProperty() paymentAvailable!: boolean;
}
export class PaymentGatewayListDto {
  @ApiProperty({ type: [PaymentGatewayDto] }) data!: PaymentGatewayDto[];
}
export class PaymentConnectionSummaryDto {
  @ApiProperty() version!: number;
  @ApiProperty() dqrAccessConfirmed!: boolean;
  @ApiProperty() provider!: string;
  @ApiProperty({ enum: PAYMENT_ENVIRONMENTS }) environment!: string;
  @ApiProperty({ enum: ["UNVERIFIED", "VERIFIED"] }) status!:
    "UNVERIFIED" | "VERIFIED";
  @ApiProperty() updatedAt!: string;
}
export class StorePaymentSettingsDto {
  @ApiProperty() version!: number;
  @ApiProperty({ nullable: true, type: String }) selectedProvider!:
    string | null;
  @ApiProperty() paymentAvailable!: boolean;
  @ApiProperty({ type: [PaymentGatewayDto] }) gateways!: PaymentGatewayDto[];
  @ApiProperty({ type: [PaymentConnectionSummaryDto] })
  connections!: PaymentConnectionSummaryDto[];
}
