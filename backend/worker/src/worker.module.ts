import { Module } from "@nestjs/common";

import { WorkerPrismaService } from "./prisma.service.js";
import { WebhookRetryService } from "./webhook-retry.service.js";
import { WorkerService } from "./worker.service.js";

@Module({
  providers: [WorkerPrismaService, WebhookRetryService, WorkerService],
})
export class WorkerModule {}
