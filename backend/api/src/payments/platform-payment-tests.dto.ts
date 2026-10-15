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
  @ApiProperty({ enum: ["UAT"] }) environment!: string;
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
  @ApiProperty({ enum: [true] }) testOnly!: true;
}
export class PlatformPaymentTestDetailDto extends PlatformPaymentTestSummaryDto {
  @ApiProperty({ nullable: true, type: String }) qrString!: string | null;
  @ApiProperty() serverTime!: string;
}
export class PlatformPaymentTestConnectionDto {
  @ApiProperty() provider!: string;
  @ApiProperty({ enum: ["UAT"] }) environment!: string;
  @ApiProperty() version!: number;
  @ApiProperty() dqrAccessConfirmed!: boolean;
  @ApiProperty() updatedAt!: string;
}
export class PlatformPaymentTestWorkspaceDto {
  @ApiProperty({ nullable: true, type: PlatformPaymentTestConnectionDto })
  connection!: PlatformPaymentTestConnectionDto | null;
  @ApiProperty() executionEnabled!: boolean;
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
