import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { ShopifyOauthService } from "./shopify-oauth.service.js";

@Injectable()
export class ShopifyReconciliationService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(ShopifyReconciliationService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: ShopifyOauthService,
  ) {}
  onModuleInit() {
    if (
      process.env.NODE_ENV === "test" ||
      process.env.SHOPIFY_RECONCILIATION_ENABLED === "false"
    )
      return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const jobs = await this.prisma.integration.findMany({
        where: {
          type: "SHOPIFY",
          metadata: { path: ["connectionMode"], equals: "SHOPIFY_OAUTH" },
          status: { in: ["ACTIVE", "ERROR"] },
          organization: { status: "ACTIVE" },
          providerCredential: { isNot: null },
          catalogNextSyncAt: { lte: new Date() },
          OR: [
            { catalogSyncLeaseUntil: null },
            { catalogSyncLeaseUntil: { lt: new Date() } },
          ],
        },
        orderBy: [{ catalogNextSyncAt: "asc" }, { id: "asc" }],
        take: 5,
        select: { id: true },
      });
      for (const job of jobs) {
        try {
          await this.oauth.sync(undefined, job.id);
        } catch {
          this.logger.warn({
            event: "shopify_reconciliation_deferred",
            integrationId: job.id,
          });
        }
      }
    } catch {
      this.logger.warn({ event: "shopify_reconciliation_unavailable" });
    } finally {
      this.running = false;
    }
  }
}
