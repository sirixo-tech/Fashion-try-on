import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { OrderPaymentsService } from "./order-payments.service.js";
@Injectable()
export class PaymentReconciliationService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(PaymentReconciliationService.name);
  constructor(private readonly payments: OrderPaymentsService) {}
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
      await this.payments.reconcileDue();
    } catch {
      this.logger.warn(
        "Payment reconciliation will retry after an unavailable check.",
      );
    } finally {
      this.running = false;
    }
  }
}
