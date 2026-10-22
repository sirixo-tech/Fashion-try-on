import { ApiProperty } from "@nestjs/swagger";
import { Matches, MaxLength, IsString } from "class-validator";
export class StartOrderPaymentDto {
  @ApiProperty() @Matches(/^[A-Za-z0-9_-]{8,100}$/) idempotencyKey!: string;
}
export class PhonePeCallbackDto {
  @ApiProperty()
  @IsString()
  @MaxLength(32768)
  @Matches(/^[A-Za-z0-9+/]+={0,2}$/)
  response!: string;
}
export class OrderPaymentSummaryDto {
  @ApiProperty() id!: string;
  @ApiProperty() provider!: string;
  @ApiProperty({ enum: ["UAT", "PRODUCTION"] }) environment!: string;
  @ApiProperty({
    enum: ["PREPARING", "PENDING", "UNKNOWN", "FAILED", "SUCCEEDED"],
  })
  status!: string;
  @ApiProperty() amountMinor!: number;
  @ApiProperty() currency!: string;
  @ApiProperty({ nullable: true, type: String }) providerReference!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) failureCode!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ nullable: true, type: String }) paidAt!: string | null;
}
export class DeviceOrderPaymentDto extends OrderPaymentSummaryDto {
  @ApiProperty({ nullable: true, type: String }) qrString!: string | null;
  @ApiProperty() testOnly!: boolean;
  @ApiProperty() serverTime!: string;
}
