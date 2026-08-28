import { Injectable } from "@nestjs/common";
import { KioskAssignmentScope, Prisma, type KioskDevice } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { PrismaService } from "../database/prisma.service.js";

export const KIOSK_USAGE_EVENTS = {
  sessionStarted: "KIOSK_SESSION_STARTED",
  sessionCompleted: "KIOSK_SESSION_COMPLETED",
  sessionIdleExpired: "KIOSK_SESSION_IDLE_EXPIRED",
  tryOnGenerated: "KIOSK_TRY_ON_GENERATED",
  downloadCompleted: "KIOSK_DOWNLOAD_COMPLETED",
} as const;

export type KioskUsageEventName =
  (typeof KIOSK_USAGE_EVENTS)[keyof typeof KIOSK_USAGE_EVENTS];

export type KioskUsageDeviceContext = Pick<
  KioskDevice,
  "id" | "assignmentScope" | "organizationId" | "storeId"
>;

export interface RecordKioskUsageEventInput {
  eventName: KioskUsageEventName;
  idempotencyKey: string;
  device: KioskUsageDeviceContext;
  tryOnSessionId?: string | null;
  kioskTryOnRunId?: string | null;
  tryOnLookId?: string | null;
  productId?: string | null;
  provider?: string | null;
  providerModel?: string | null;
  status?: string | null;
  quantity?: number;
  metadata?: Prisma.InputJsonValue;
  occurredAt?: Date;
}

@Injectable()
export class UsageEventService {
  constructor(private readonly prisma: PrismaService) {}

  async recordKioskEvent(input: RecordKioskUsageEventInput) {
    try {
      return await this.prisma.usageEvent.create({
        data: {
          id: createSelfxId(),
          idempotencyKey: input.idempotencyKey,
          eventName: input.eventName,
          channel: "KIOSK",
          assignmentScope: input.device.assignmentScope,
          organizationId:
            input.device.assignmentScope === KioskAssignmentScope.PLATFORM
              ? null
              : input.device.organizationId,
          storeId:
            input.device.assignmentScope === KioskAssignmentScope.STORE
              ? input.device.storeId
              : null,
          kioskDeviceId: input.device.id,
          tryOnSessionId: input.tryOnSessionId ?? null,
          kioskTryOnRunId: input.kioskTryOnRunId ?? null,
          tryOnLookId: input.tryOnLookId ?? null,
          productId: input.productId ?? null,
          provider: input.provider ?? null,
          providerModel: input.providerModel ?? null,
          status: input.status ?? null,
          quantity:
            input.quantity &&
            Number.isInteger(input.quantity) &&
            input.quantity > 0
              ? input.quantity
              : 1,
          metadata: input.metadata,
          occurredAt: input.occurredAt,
        },
      });
    } catch (error) {
      if (isUniqueConflict(error)) {
        return this.prisma.usageEvent.findUniqueOrThrow({
          where: { idempotencyKey: input.idempotencyKey },
        });
      }
      throw error;
    }
  }
}

function isUniqueConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}
