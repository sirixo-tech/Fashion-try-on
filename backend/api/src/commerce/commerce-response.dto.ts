import { ApiProperty } from "@nestjs/swagger";
import { type TaxMode, TAX_MODES, ORDER_STATUSES } from "./commerce.dto.js";
import { OrderPaymentSummaryDto } from "../payments/payment-execution.dto.js";
export class StoreTaxResponseDto {
  @ApiProperty({ enum: TAX_MODES }) mode!: TaxMode;
  @ApiProperty() rateBasisPoints!: number;
  @ApiProperty() version!: number;
}
export class ShoppingOrderItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() productId!: string;
  @ApiProperty() variantId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({ nullable: true }) size!: string | null;
  @ApiProperty({ nullable: true }) color!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() unitPriceCents!: number;
  @ApiProperty() taxRateBasisPoints!: number;
  @ApiProperty() subtotalCents!: number;
  @ApiProperty() taxCents!: number;
  @ApiProperty() totalCents!: number;
}
export class ShoppingOrderDto {
  @ApiProperty({ nullable: true, type: String }) paidAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) stockAllocatedAt!:
    string | null;
  @ApiProperty({ nullable: true, type: String }) paymentReviewReason!:
    string | null;
  @ApiProperty({ type: [OrderPaymentSummaryDto] })
  paymentAttempts!: OrderPaymentSummaryDto[];
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty({ enum: ORDER_STATUSES }) status!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: TAX_MODES }) taxMode!: TaxMode;
  @ApiProperty() subtotalCents!: number;
  @ApiProperty() taxCents!: number;
  @ApiProperty() totalCents!: number;
  @ApiProperty() createdAt!: string;
  @ApiProperty() expiresAt!: string;
  @ApiProperty({ nullable: true }) cancelledAt!: string | null;
  @ApiProperty() serverTime!: string;
  @ApiProperty({ enum: [false] }) paymentAvailable!: false;
  @ApiProperty({ type: [ShoppingOrderItemDto] }) items!: ShoppingOrderItemDto[];
}
export class ShoppingCartLineDto {
  @ApiProperty() productId!: string;
  @ApiProperty() variantId!: string;
  @ApiProperty() productName!: string;
  @ApiProperty({ nullable: true }) size!: string | null;
  @ApiProperty({ nullable: true }) color!: string | null;
  @ApiProperty() quantity!: number;
  @ApiProperty() availableStockQuantity!: number;
  @ApiProperty({ nullable: true }) unitPriceCents!: number | null;
  @ApiProperty({ nullable: true }) currency!: string | null;
  @ApiProperty() taxRateBasisPoints!: number;
  @ApiProperty({ nullable: true }) subtotalCents!: number | null;
  @ApiProperty({ nullable: true }) taxCents!: number | null;
  @ApiProperty({ nullable: true }) totalCents!: number | null;
}
export class ShoppingCartIssueDto {
  @ApiProperty() variantId!: string;
  @ApiProperty() code!: string;
}
export class ShoppingCartDto {
  @ApiProperty({ nullable: true }) cartId!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [ShoppingCartLineDto] }) items!: ShoppingCartLineDto[];
  @ApiProperty({ type: [ShoppingCartIssueDto] })
  issues!: ShoppingCartIssueDto[];
  @ApiProperty({ nullable: true }) currency!: string | null;
  @ApiProperty({ enum: TAX_MODES }) taxMode!: TaxMode;
  @ApiProperty({ nullable: true }) subtotalCents!: number | null;
  @ApiProperty({ nullable: true }) taxCents!: number | null;
  @ApiProperty({ nullable: true }) totalCents!: number | null;
  @ApiProperty() canCheckout!: boolean;
  @ApiProperty({ nullable: true }) activeOrderId!: string | null;
  @ApiProperty() quoteFingerprint!: string;
  @ApiProperty() serverTime!: string;
  @ApiProperty({ enum: [false] }) paymentAvailable!: false;
}
export class ShoppingPaginationDto {
  @ApiProperty() page!: number;
  @ApiProperty() pageSize!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
  @ApiProperty() hasMore!: boolean;
}
export class ShoppingOrderListDto {
  @ApiProperty({ type: [ShoppingOrderDto] }) data!: ShoppingOrderDto[];
  @ApiProperty({ type: ShoppingPaginationDto })
  pagination!: ShoppingPaginationDto;
}
