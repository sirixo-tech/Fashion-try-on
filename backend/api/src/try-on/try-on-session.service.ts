import { HttpStatus, Injectable, Optional } from "@nestjs/common";
import {
  KioskAssignmentScope,
  Prisma,
  TryOnAssetPurpose,
  TryOnSessionStatus,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { TRY_ON_RESULT_RETENTION_MS } from "./try-on.constants.js";

export interface TryOnSessionTenantContext {
  assignmentScope: KioskAssignmentScope;
  organizationId: string | null;
  storeId: string | null;
  kioskDeviceId?: string | null;
}

export interface TryOnAssetStorageInput {
  storageKey: string;
  contentType?: string | null;
  sizeBytes?: number | null;
  width?: number | null;
  height?: number | null;
  expiresAt?: Date;
}

export interface CreateTryOnSessionInput extends TryOnSessionTenantContext {
  expiresAt?: Date;
}

export interface ScopedSessionInput {
  sessionId: string;
  kioskDeviceId?: string | null;
}

@Injectable()
export class TryOnSessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly storage?: ObjectStorageService,
  ) {}

  async createSession(input: CreateTryOnSessionInput) {
    return this.prisma.tryOnSession.create({
      data: {
        id: createSelfxId(),
        status: TryOnSessionStatus.ACTIVE,
        assignmentScope: input.assignmentScope,
        organizationId:
          input.assignmentScope === KioskAssignmentScope.PLATFORM
            ? null
            : input.organizationId,
        storeId:
          input.assignmentScope === KioskAssignmentScope.STORE
            ? input.storeId
            : null,
        kioskDeviceId: input.kioskDeviceId ?? null,
        expiresAt: input.expiresAt ?? defaultExpiresAt(),
      },
    });
  }

  async attachPersonAsset(input: ScopedSessionInput & TryOnAssetStorageInput) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.requireActiveSession(tx, input);
      const asset = await this.createAsset(tx, session, TryOnAssetPurpose.PERSON, input);
      await tx.tryOnSession.update({
        where: { id: session.id },
        data: { currentPersonAssetId: asset.id },
      });
      return asset;
    });
  }

  async attachGarmentAsset(input: ScopedSessionInput & TryOnAssetStorageInput) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.requireActiveSession(tx, input);
      return this.createAsset(tx, session, TryOnAssetPurpose.GARMENT, input);
    });
  }

  async setCurrentPerson(input: ScopedSessionInput & { personAssetId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.requireActiveSession(tx, input);
      await this.requireSessionAsset(tx, {
        sessionId: session.id,
        assetId: input.personAssetId,
        purpose: TryOnAssetPurpose.PERSON,
      });
      return tx.tryOnSession.update({
        where: { id: session.id },
        data: { currentPersonAssetId: input.personAssetId },
      });
    });
  }

  async getCurrentPersonAsset(input: ScopedSessionInput) {
    const session = await this.requireActiveSession(this.prisma, input);
    if (!session.currentPersonAssetId) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        "TRY_ON_SESSION_PERSON_REQUIRED",
        "Try-On session does not have a current person image.",
      );
    }
    return this.requireSessionAsset(this.prisma, {
      sessionId: session.id,
      assetId: session.currentPersonAssetId,
      purpose: TryOnAssetPurpose.PERSON,
    });
  }

  async getSessionAsset(
    input: ScopedSessionInput & {
      assetId: string;
      purpose: TryOnAssetPurpose;
    },
  ) {
    const session = await this.requireActiveSession(this.prisma, input);
    return this.requireSessionAsset(this.prisma, {
      sessionId: session.id,
      assetId: input.assetId,
      purpose: input.purpose,
    });
  }

  async recordRun(
    input: ScopedSessionInput & {
      kioskTryOnRunId: string;
      personAssetId: string;
      garmentAssetId?: string | null;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const session = await this.requireActiveSession(tx, input);
      await this.requireSessionAsset(tx, {
        sessionId: session.id,
        assetId: input.personAssetId,
        purpose: TryOnAssetPurpose.PERSON,
      });
      if (input.garmentAssetId) {
        await this.requireSessionAsset(tx, {
          sessionId: session.id,
          assetId: input.garmentAssetId,
          purpose: TryOnAssetPurpose.GARMENT,
        });
      }

      const updated = await tx.kioskTryOnRun.updateMany({
        where: {
          id: input.kioskTryOnRunId,
          kioskDeviceId:
            session.kioskDeviceId === null ? undefined : session.kioskDeviceId,
        },
        data: {
          tryOnSessionId: session.id,
          personAssetId: input.personAssetId,
          garmentAssetId: input.garmentAssetId ?? null,
        },
      });
      if (updated.count === 0) {
        throw notFound("Try-On run was not found for this session context.");
      }
      return tx.kioskTryOnRun.findUniqueOrThrow({
        where: { id: input.kioskTryOnRunId },
      });
    });
  }

  async recordLook(
    input: ScopedSessionInput & {
      kioskTryOnRunId: string;
      personAssetId: string;
      garmentAssetId?: string | null;
      productId?: string | null;
      resultAsset: TryOnAssetStorageInput;
      expiresAt?: Date;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.tryOnLook.findUnique({
        where: { kioskTryOnRunId: input.kioskTryOnRunId },
        include: lookIncludes,
      });
      if (existing) {
        return existing;
      }

      const session = await this.requireActiveSession(tx, input);
      const run = await tx.kioskTryOnRun.findFirst({
        where: {
          id: input.kioskTryOnRunId,
          tryOnSessionId: session.id,
          kioskDeviceId:
            session.kioskDeviceId === null ? undefined : session.kioskDeviceId,
          status: "COMPLETED",
        },
      });
      if (!run) {
        throw notFound("A completed Try-On run was not found for this session.");
      }

      await this.requireSessionAsset(tx, {
        sessionId: session.id,
        assetId: input.personAssetId,
        purpose: TryOnAssetPurpose.PERSON,
      });
      if (input.garmentAssetId) {
        await this.requireSessionAsset(tx, {
          sessionId: session.id,
          assetId: input.garmentAssetId,
          purpose: TryOnAssetPurpose.GARMENT,
        });
      }
      const resultAsset = await this.createAsset(
        tx,
        session,
        TryOnAssetPurpose.RESULT,
        input.resultAsset,
      );
      const look = await tx.tryOnLook.create({
        data: {
          id: createSelfxId(),
          sessionId: session.id,
          kioskTryOnRunId: run.id,
          personAssetId: input.personAssetId,
          garmentAssetId: input.garmentAssetId ?? null,
          productId: input.productId ?? null,
          resultAssetId: resultAsset.id,
          assignmentScope: session.assignmentScope,
          organizationId: session.organizationId,
          storeId: session.storeId,
          kioskDeviceId: session.kioskDeviceId,
          expiresAt: input.expiresAt ?? resultAsset.expiresAt,
        },
        include: lookIncludes,
      });
      await tx.kioskTryOnRun.update({
        where: { id: run.id },
        data: { resultAssetId: resultAsset.id },
      });
      return look;
    });
  }

  async getSessionLooks(input: ScopedSessionInput) {
    const session = await this.requireSession(this.prisma, input);
    return this.prisma.tryOnLook.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: "asc" },
      include: lookIncludes,
    });
  }

  async completeSession(input: ScopedSessionInput) {
    const now = new Date();
    const where = scopedSessionWhere(input);
    const completed = await this.prisma.$transaction(async (tx) => {
      const assets = await tx.tryOnAsset.findMany({
        where: { sessionId: input.sessionId, deletedAt: null },
        select: { storageKey: true },
      });
      const result = await tx.tryOnSession.updateMany({
        where: { ...where, status: TryOnSessionStatus.ACTIVE },
        data: {
          status: TryOnSessionStatus.COMPLETED,
          completedAt: now,
          currentPersonAssetId: null,
        },
      });
      if (result.count > 0) {
        await tx.tryOnShareCapability.updateMany({
          where: { sessionId: input.sessionId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.tryOnLook.updateMany({
          where: { sessionId: input.sessionId, expiresAt: { gt: now } },
          data: { expiresAt: now },
        });
        await tx.kioskTryOnRun.updateMany({
          where: { tryOnSessionId: input.sessionId },
          data: { resultImage: null },
        });
        await tx.tryOnAsset.updateMany({
          where: { sessionId: input.sessionId, deletedAt: null },
          data: { deletedAt: now, expiresAt: now },
        });
      }
      return { result, storageKeys: assets.map((asset) => asset.storageKey) };
    });

    if (completed.result.count === 0) {
      return this.prisma.tryOnSession.findFirstOrThrow({ where });
    }
    await this.deleteStorageObjects(completed.storageKeys);
    return this.prisma.tryOnSession.findFirstOrThrow({ where });
  }

  private async createAsset(
    tx: Prisma.TransactionClient,
    session: SessionScope,
    purpose: TryOnAssetPurpose,
    input: TryOnAssetStorageInput,
  ) {
    return tx.tryOnAsset.create({
      data: {
        id: createSelfxId(),
        sessionId: session.id,
        purpose,
        assignmentScope: session.assignmentScope,
        organizationId: session.organizationId,
        storeId: session.storeId,
        kioskDeviceId: session.kioskDeviceId,
        storageKey: input.storageKey,
        contentType: input.contentType ?? null,
        sizeBytes: input.sizeBytes ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        expiresAt: input.expiresAt ?? defaultExpiresAt(),
      },
    });
  }

  private async requireActiveSession(
    tx: Pick<PrismaService, "tryOnSession"> | Prisma.TransactionClient,
    input: ScopedSessionInput,
  ): Promise<SessionScope> {
    const session = await this.requireSession(tx, input);
    if (
      session.status !== TryOnSessionStatus.ACTIVE ||
      session.expiresAt <= new Date()
    ) {
      throw new ApiErrorException(
        HttpStatus.CONFLICT,
        "TRY_ON_SESSION_NOT_ACTIVE",
        "Try-On session is not active.",
      );
    }
    return session;
  }

  private async deleteStorageObjects(storageKeys: string[]): Promise<void> {
    if (!this.storage || storageKeys.length === 0) {
      return;
    }
    const uniqueKeys = [...new Set(storageKeys)];
    await Promise.allSettled(
      uniqueKeys.map((storageKey) => this.storage!.deleteObject(storageKey)),
    );
  }

  private async requireSession(
    tx: Pick<PrismaService, "tryOnSession"> | Prisma.TransactionClient,
    input: ScopedSessionInput,
  ): Promise<SessionScope> {
    const session = await tx.tryOnSession.findFirst({
      where: scopedSessionWhere(input),
      select: sessionScopeSelect,
    });
    if (!session) {
      throw notFound("Try-On session was not found.");
    }
    return session;
  }

  private async requireSessionAsset(
    tx: Pick<PrismaService, "tryOnAsset"> | Prisma.TransactionClient,
    input: {
      sessionId: string;
      assetId: string;
      purpose: TryOnAssetPurpose;
    },
  ) {
    const asset = await tx.tryOnAsset.findFirst({
      where: {
        id: input.assetId,
        sessionId: input.sessionId,
        purpose: input.purpose,
        deletedAt: null,
      },
    });
    if (!asset) {
      throw notFound("Try-On asset was not found for this session.");
    }
    return asset;
  }
}

const sessionScopeSelect = {
  id: true,
  status: true,
  assignmentScope: true,
  organizationId: true,
  storeId: true,
  kioskDeviceId: true,
  currentPersonAssetId: true,
  expiresAt: true,
} satisfies Prisma.TryOnSessionSelect;

type SessionScope = Prisma.TryOnSessionGetPayload<{
  select: typeof sessionScopeSelect;
}>;

const lookIncludes = {
  personAsset: true,
  garmentAsset: true,
  resultAsset: true,
} satisfies Prisma.TryOnLookInclude;

function scopedSessionWhere(input: ScopedSessionInput): Prisma.TryOnSessionWhereInput {
  return {
    id: input.sessionId,
    kioskDeviceId:
      input.kioskDeviceId === undefined ? undefined : input.kioskDeviceId,
  };
}

function defaultExpiresAt(): Date {
  return new Date(Date.now() + TRY_ON_RESULT_RETENTION_MS);
}

function notFound(message: string): ApiErrorException {
  return new ApiErrorException(
    HttpStatus.NOT_FOUND,
    "TRY_ON_SESSION_NOT_FOUND",
    message,
  );
}
