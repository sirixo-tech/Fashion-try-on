import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import { WebhookRetryService } from "./webhook-retry.service.js";

const defaultWebhookRetryIntervalMs = 60_000;

@Injectable()
export class WorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerService.name);
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private retryCycleRunning = false;

  constructor(private readonly webhooks: WebhookRetryService) {}

  async onModuleInit() {
    this.logger.log("SelfX worker started.");
    if (process.env.SELFX_WEBHOOK_RETRY_ENABLED === "false") {
      this.logger.log("Public API webhook retries are disabled.");
      return;
    }

    await this.runWebhookRetryCycle();
    this.retryTimer = setInterval(
      () => void this.runWebhookRetryCycle(),
      webhookRetryIntervalMs(),
    );
  }

  onModuleDestroy() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private async runWebhookRetryCycle(): Promise<void> {
    if (this.retryCycleRunning) {
      return;
    }
    this.retryCycleRunning = true;
    try {
      const result = await this.webhooks.retryDueDeliveries();
      if (
        result.scanned > 0 ||
        result.exhausted > 0 ||
        !result.signingConfigured
      ) {
        this.logger.log({
          event: "public_api_webhook_retry_cycle",
          ...result,
        });
      }
    } catch (error) {
      this.logger.error({
        event: "public_api_webhook_retry_cycle_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      this.retryCycleRunning = false;
    }
  }
}

function webhookRetryIntervalMs(): number {
  const parsed = Number.parseInt(
    process.env.SELFX_WEBHOOK_RETRY_INTERVAL_MS ?? "",
    10,
  );
  if (!Number.isFinite(parsed)) {
    return defaultWebhookRetryIntervalMs;
  }
  return Math.min(Math.max(parsed, 10_000), 10 * 60 * 1000);
}
