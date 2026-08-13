import { Injectable } from "@nestjs/common";

import type {
  ImageQualityIssueCode,
  SelfxGarmentAnalysisReasonCode,
  SelfxGarmentBodyCoverage,
  SelfxGarmentCategory,
  SelfxGarmentIntent,
  SelfxGarmentPhotoType,
  SelfxGarmentSource,
  SelfxGenerationProfile,
  SelfxGenerationPolicyResolutionSource,
  SelfxTryOnTelemetry,
  SelfxTryOnRunStatus,
  TryOnLabErrorCode,
  TryOnLabRunResponse,
} from "@selfx/shared";

import type { TryOnProviderMetadata } from "./providers/try-on-provider.js";

import {
  TRY_ON_LAB_MAX_RUNS,
  TRY_ON_LAB_RUN_TTL_MS,
} from "./try-on-lab.constants.js";

export interface TryOnLabRunRecord {
  id: string;
  actorUserId: string;
  providerPredictionId?: string;
  status: SelfxTryOnRunStatus;
  provider: string;
  providerDisplayName: string;
  providerModel: string;
  garmentSource: SelfxGarmentSource;
  garmentIntent: SelfxGarmentIntent;
  category: SelfxGarmentCategory;
  garmentPhotoType: SelfxGarmentPhotoType;
  generationProfile: SelfxGenerationProfile;
  categoryResolutionSource: SelfxGenerationPolicyResolutionSource;
  photoTypeResolutionSource: SelfxGenerationPolicyResolutionSource;
  profileResolutionSource: SelfxGenerationPolicyResolutionSource;
  analysisConfidence?: number;
  disambiguationRequired: boolean;
  disambiguationResolved: boolean;
  garmentAnalysisBodyCoverage?: SelfxGarmentBodyCoverage;
  garmentAnalysisReasonCodes: SelfxGarmentAnalysisReasonCode[];
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  updatedAt: Date;
  expiresAt: Date;
  qualityWarningCodes: ImageQualityIssueCode[];
  qualityOverrideAccepted: boolean;
  resultImage?: string;
  errorCode?: TryOnLabErrorCode;
  errorMessage?: string;
}

export interface CreateTryOnLabRunRecordInput {
  id: string;
  actorUserId: string;
  garmentSource: SelfxGarmentSource;
  garmentIntent: SelfxGarmentIntent;
  category: SelfxGarmentCategory;
  garmentPhotoType: SelfxGarmentPhotoType;
  generationProfile: SelfxGenerationProfile;
  categoryResolutionSource: SelfxGenerationPolicyResolutionSource;
  photoTypeResolutionSource: SelfxGenerationPolicyResolutionSource;
  profileResolutionSource: SelfxGenerationPolicyResolutionSource;
  analysisConfidence?: number;
  disambiguationRequired: boolean;
  disambiguationResolved: boolean;
  garmentAnalysisBodyCoverage?: SelfxGarmentBodyCoverage;
  garmentAnalysisReasonCodes: SelfxGarmentAnalysisReasonCode[];
  providerMetadata: TryOnProviderMetadata;
  qualityWarningCodes: ImageQualityIssueCode[];
  qualityOverrideAccepted: boolean;
}

@Injectable()
export class TryOnLabRunRegistryService {
  private readonly runs = new Map<string, TryOnLabRunRecord>();

  create(input: CreateTryOnLabRunRecordInput): TryOnLabRunRecord {
    this.cleanupExpired();
    this.enforceBound();

    const now = new Date();
    const run: TryOnLabRunRecord = {
      id: input.id,
      actorUserId: input.actorUserId,
      status: "QUEUED",
      provider: input.providerMetadata.provider,
      providerDisplayName: input.providerMetadata.providerDisplayName,
      providerModel: input.providerMetadata.model,
      garmentSource: input.garmentSource,
      garmentIntent: input.garmentIntent,
      category: input.category,
      garmentPhotoType: input.garmentPhotoType,
      generationProfile: input.generationProfile,
      categoryResolutionSource: input.categoryResolutionSource,
      photoTypeResolutionSource: input.photoTypeResolutionSource,
      profileResolutionSource: input.profileResolutionSource,
      analysisConfidence: input.analysisConfidence,
      disambiguationRequired: input.disambiguationRequired,
      disambiguationResolved: input.disambiguationResolved,
      garmentAnalysisBodyCoverage: input.garmentAnalysisBodyCoverage,
      garmentAnalysisReasonCodes: input.garmentAnalysisReasonCodes,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + TRY_ON_LAB_RUN_TTL_MS),
      qualityWarningCodes: input.qualityWarningCodes,
      qualityOverrideAccepted: input.qualityOverrideAccepted,
    };
    this.runs.set(run.id, run);
    return run;
  }

  getForActor(runId: string, actorUserId: string): TryOnLabRunRecord | null {
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
        TryOnLabRunRecord,
        | "providerPredictionId"
        | "status"
        | "startedAt"
        | "completedAt"
        | "resultImage"
        | "errorCode"
        | "errorMessage"
      >
    >,
  ): TryOnLabRunRecord | null {
    const run = this.runs.get(runId);
    if (!run) {
      return null;
    }

    Object.assign(run, patch, { updatedAt: new Date() });
    return run;
  }

  toResponse(run: TryOnLabRunRecord): TryOnLabRunResponse {
    return {
      id: run.id,
      status: run.status,
      garmentSource: run.garmentSource,
      garmentIntent: run.garmentIntent,
      category: run.category,
      garmentPhotoType: run.garmentPhotoType,
      generationProfile: run.generationProfile,
      createdAt: run.createdAt.toISOString(),
      updatedAt: run.updatedAt.toISOString(),
      resultImage: run.resultImage,
      errorCode: run.errorCode,
      errorMessage: run.errorMessage,
      telemetry: this.toTelemetry(run),
    };
  }

  private toTelemetry(run: TryOnLabRunRecord): SelfxTryOnTelemetry {
    const completedAt = run.completedAt?.toISOString();

    return {
      selfxRunId: run.id,
      channel: "WEB_LAB",
      provider: run.provider,
      providerDisplayName: run.providerDisplayName,
      model: run.providerModel,
      profile: run.generationProfile,
      garmentSource: run.garmentSource,
      garmentIntent: run.garmentIntent,
      garmentCategory: run.category,
      garmentPhotoType: run.garmentPhotoType,
      categoryResolutionSource: run.categoryResolutionSource,
      photoTypeResolutionSource: run.photoTypeResolutionSource,
      profileResolutionSource: run.profileResolutionSource,
      analysisConfidence: run.analysisConfidence,
      disambiguationRequired: run.disambiguationRequired,
      disambiguationResolved: run.disambiguationResolved,
      garmentAnalysisBodyCoverage: run.garmentAnalysisBodyCoverage,
      garmentAnalysisReasonCodes: run.garmentAnalysisReasonCodes,
      createdAt: run.createdAt.toISOString(),
      startedAt: run.startedAt?.toISOString(),
      completedAt,
      elapsedMs:
        run.startedAt && run.completedAt
          ? run.completedAt.getTime() - run.startedAt.getTime()
          : undefined,
      status: run.status,
      failureCode: run.errorCode,
      qualityWarningCodes: run.qualityWarningCodes,
      qualityOverrideAccepted: run.qualityOverrideAccepted,
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
