import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from "@nestjs/common";
import { CommerceService } from "./commerce.service.js";

@Injectable()
export class CommerceExpiryService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(CommerceExpiryService.name);
  constructor(private readonly commerce: CommerceService) {}
  onModuleInit() {
    if (process.env.SHOPPING_EXPIRY_ENABLED === "false") return;
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
      await this.commerce.expireDueOrders();
    } catch {
      this.logger.warn(
        "Shopping expiry sweep failed; the next sweep will retry. Availability still excludes expired holds.",
      );
    } finally {
      this.running = false;
    }
  }
}
