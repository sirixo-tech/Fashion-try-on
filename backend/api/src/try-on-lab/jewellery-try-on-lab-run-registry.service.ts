import { Injectable } from "@nestjs/common";

import {
  type JewelleryTryOnLabRunResponse,
  type JewelleryTryOnLabTelemetry,
  type SelfxTryOnRunStatus,
  type TryOnLabErrorCode,
} from "@selfx/shared";

import type { JewelleryType } from "../catalog/product-kind.js";
import type { JewelleryTryOnProviderMetadata } from "../try-on/jewellery/jewellery-try-on.provider.js";
import {
  TRY_ON_LAB_MAX_RUNS,
  TRY_ON_LAB_RUN_TTL_MS,
} from "./try-on-lab.constants.js";
import type { CreateJewelleryTryOnLabRunPayload } from "./jewellery-try-on-lab-multipart.js";

export interface JewelleryTryOnLabRunRecord {
  id: string;
  actorUserId: string;
  providerPredictionId?: string;
  status: SelfxTryOnRunStatus;
  provider: string;
  providerDisplayName: string;
  providerModel: string;
  jewelleryType: JewelleryType;
  productReference?: CreateJewelleryTryOnLabRunPayload["productReference"];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
  expiresAt: Date;
  resultImage?: string;
  errorCode?: TryOnLabErrorCode;
  errorMessage?: string;
}

export interface CreateJewelleryTryOnLabRunRecordInput {
  id: string;
  actorUserId: string;
  jewelleryType: JewelleryType;
  productReference?: CreateJewelleryTryOnLabRunPayload["productReference"];
  providerMetadata: JewelleryTryOnProviderMetadata;
}

@Injectable()
export class JewelleryTryOnLabRunRegistryService {
  private readonly runs = new Map<string, JewelleryTryOnLabRunRecord>();

  create(
    input: CreateJewelleryTryOnLabRunRecordInput,
  ): JewelleryTryOnLabRunRecord {
    this.cleanupExpired();
    this.enforceBound();

    const now = new Date();
    const run: JewelleryTryOnLabRunRecord = {
      id: input.id,
      actorUserId: input.actorUserId,
      status: "QUEUED",
      provider: input.providerMetadata.provider,
      providerDisplayName: input.providerMetadata.providerDisplayName,
      providerModel: input.providerMetadata.model,
      jewelleryType: input.jewelleryType,
      productReference: input.productReference,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + TRY_ON_LAB_RUN_TTL_MS),
    };
    this.runs.set(run.id, run);
    return run;
  }

  getForActor(
    runId: string,
    actorUserId: string,
  ): JewelleryTryOnLabRunRecord | null {
    this.cleanupExpired();
    const run = this.runs.get(runId);
    if (!run || run.actorUserId !== actorUserId) {
      return null;
    }
    return run;
  }

  update(
    runId: string,
    patch: Partial<
      Pick<
        JewelleryTryOnLabRunRecord,
        | "providerPredictionId"
        | "status"
        | "startedAt"
        | "completedAt"
        | "resultImage"
        | "errorCode"
        | "errorMessage"
      >
    >,
  ): JewelleryTryOnLabRunRecord | null {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }

    Object.assign(run, patch, { updatedAt: new Date() });
    return run;
  }

  toResponse(run: JewelleryTryOnLabRunRecord): JewelleryTryOnLabRunResponse {
    return {
      id: run.id,
      status: run.status,
      tryOnVertical: "JEWELLERY",
      jewelleryType: run.jewelleryType,
      productReference: run.productReference,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      resultImage: run.resultImage,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      telemetry: this.toTelemetry(run),
    };
  }

  private toTelemetry(
    run: JewelleryTryOnLabRunRecord,
  ): JewelleryTryOnLabTelemetry {
    return {
      selfxRunId: run.id,
      channel: "WEB_LAB",
      provider: run.provider,
      providerDisplayName: run.providerDisplayName,
      model: run.providerModel,
      jewelleryType: run.jewelleryType,
      productReference: run.productReference,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString(),
      completedAt: run.completedAt?.toISOString(),
      elapsedMs:
        run.startedAt && run.completedAt
          ? run.completedAt.getTime() - run.startedAt.getTime()
          : undefined,
      status: run.status,
      failureCode: run.errorCode,
    };
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [id, run] of this.runs) {
      if (run.expiresAt.getTime() <= now) {
        this.runs.delete(id);
      }
    }
  }

  private enforceBound(): void {
    while (this.runs.size >= TRY_ON_LAB_MAX_RUNS) {
      const oldest = [...this.runs.values()].sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      )[0];
      if (!oldest) {
        return;
      }
      this.runs.delete(oldest.id);
    }
  }
}
