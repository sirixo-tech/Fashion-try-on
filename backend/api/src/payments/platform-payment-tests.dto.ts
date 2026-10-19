import { ApiProperty } from "@nestjs/swagger";
import { IsIn, Matches } from "class-validator";
import {
  PaymentRevisionDto,
  SavePhonePeConnectionDto,
} from "./payment-settings.dto.js";

export class SavePlatformPhonePeTestDto extends SavePhonePeConnectionDto {
  @ApiProperty({ enum: ["UAT"] }) @IsIn(["UAT"]) declare environment: "UAT";
}
export class StartPlatformPaymentTestDto extends PaymentRevisionDto {
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{8,100}$/) idempotencyKey!: string;
}
export class PlatformPaymentTestSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() provider!: string;
  @ApiProperty({ enum: ["UAT", "PRODUCTION"] }) environment!: string;
  @ApiProperty() connectionVersion!: number;
  @ApiProperty({
    enum: ["PREPARING", "PENDING", "UNKNOWN", "FAILED", "SUCCEEDED"],
  })
  status!: string;
  @ApiProperty() amountMinor!: number;
  @ApiProperty() currency!: string;
  @ApiProperty() createdAt!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ nullable: true, type: String }) confirmedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) checkedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) nextCheckAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) failureCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) providerReference!:
    string | null;
  @ApiProperty() callbackReceived!: boolean;
  @ApiProperty() verificationPending!: boolean;
  @ApiProperty({
    description:
      "False for a Store production verification, which collects real money.",
  })
  testOnly!: boolean;
}
export class PaymentTestDiagnosticDto {
  @ApiProperty() code!: string;
  @ApiProperty() message!: string;
  @ApiProperty({ type: Number, nullable: true }) httpStatus!: number | null;
  @ApiProperty({ type: String, nullable: true }) providerCode!: string | null;
  @ApiProperty() at!: string;
}
export class PaymentTestDiagnosticsDto {
  @ApiProperty({ type: PaymentTestDiagnosticDto, nullable: true })
  initialization!: PaymentTestDiagnosticDto | null;
  @ApiProperty({ type: PaymentTestDiagnosticDto, nullable: true })
  status!: PaymentTestDiagnosticDto | null;
}
export class PlatformPaymentTestDetailDto extends PlatformPaymentTestSummaryDto {
  @ApiProperty({ type: PaymentTestDiagnosticsDto })
  diagnostics!: PaymentTestDiagnosticsDto;
  @ApiProperty({ nullable: true, type: String }) qrString!: string | null;
  @ApiProperty() serverTime!: string;
}
export class PlatformPaymentTestConnectionDto {
  @ApiProperty() provider!: string;
  @ApiProperty({ enum: ["UNCONFIRMED", "UAT", "PRODUCTION"] })
  environment!: string;
  @ApiProperty() version!: number;
  @ApiProperty() dqrAccessConfirmed!: boolean;
  @ApiProperty() updatedAt!: string;
}
export class PlatformPaymentTestWorkspaceDto {
  @ApiProperty() serverTime!: string;
  @ApiProperty({ nullable: true, type: PlatformPaymentTestConnectionDto })
  connection!: PlatformPaymentTestConnectionDto | null;
  @ApiProperty() executionEnabled!: boolean;
  @ApiProperty() productionEndpointConfigured!: boolean;
  @ApiProperty() callbackConfigured!: boolean;
  @ApiProperty({
    enum: [
      "NOT_CONFIGURED",
      "NOT_TESTED",
      "PENDING",
      "PASSED",
      "FAILED",
      "UNKNOWN",
    ],
  })
  testStatus!: string;
  @ApiProperty({ type: [PlatformPaymentTestSummaryDto] })
  tests!: PlatformPaymentTestSummaryDto[];
}
