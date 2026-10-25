import { type PrismaService } from "../database/prisma.service.js";
import { type WooCommerceOverviewQueryDto } from "./dto/woocommerce-overview.dto.js";
import { commerceOverview } from "./commerce-overview.js";
export { catalogSyncReceipt } from "./commerce-overview.js";
export function wooCommerceOverview(
  prisma: PrismaService,
  query: WooCommerceOverviewQueryDto,
) {
  return commerceOverview(prisma, query, "WOOCOMMERCE");
}
