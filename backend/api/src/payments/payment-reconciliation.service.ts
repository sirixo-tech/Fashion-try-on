import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { OrderPaymentsService } from "./order-payments.service.js";
import { PlatformPaymentTestsService } from "./platform-payment-tests.service.js";
@Injectable()
export class PaymentReconciliationService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(PaymentReconciliationService.name);
  constructor(
    private readonly payments: OrderPaymentsService,
    private readonly platformTests: PlatformPaymentTestsService,
  ) {}
  onModuleInit() {
    if (process.env.PAYMENT_RECONCILIATION_ENABLED === "false") return;
    this.timer = setInterval(() => void this.tick(), 15000);
    this.timer.unref();
    void this.tick();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const results = await Promise.allSettled([
        this.payments.reconcileDue(),
        this.platformTests.reconcileDue(),
      ]);
      if (results.some((result) => result.status === "rejected"))
        throw new Error("Reconciliation batch unavailable.");
    } catch {
      this.logger.warn(
        "Payment reconciliation will retry after an unavailable check.",
      );
    } finally {
      this.running = false;
    }
  }
}
