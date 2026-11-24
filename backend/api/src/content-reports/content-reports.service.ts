import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma, type ContentReport } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import type {
  ContentReportsQuery,
  ReviewContentReportDto,
  SubmitContentReportDto,
} from "./content-reports.dto.js";

function fail(status: number, code: string, message: string): never {
  throw new ApiErrorException(status, code, message);
}

const reportSummary = {
  id: true,
  runId: true,
  resultAssetId: true,
  reason: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ContentReportSelect;

@Injectable()
export class ContentReportsService {
  constructor(
    private readonly db: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}

  async submit(
    customer: { id: string; securityVersion: number },
    input: SubmitContentReportDto,
  ) {
    const comment = input.comment?.trim() || null;
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ reason: input.reason, comment }))
      .digest("hex");
    return this.db.$transaction(async (tx) => {
      // Serialize submission with account deletion and submissions for this customer.
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id}::uuid FOR UPDATE`;
      const active = await tx.customer.findFirst({
        where: {
          id: customer.id,
          status: "ACTIVE",
          deletedAt: null,
          securityVersion: customer.securityVersion,
        },
        select: { id: true },
      });
      if (!active) fail(401, "CUSTOMER_UNAUTHORIZED", "Please sign in again.");
      const existing = await tx.contentReport.findUnique({
        where: {
          customerId_resultAssetId: {
            customerId: customer.id,
            resultAssetId: input.resultAssetId,
          },
        },
      });
      if (existing) {
        if (existing.requestFingerprint !== fingerprint)
          fail(
            409,
            "CONTENT_REPORT_ALREADY_SUBMITTED",
            "You have already reported this image.",
          );
        return { id: existing.id, submitted: true };
      }
      // Derive run and ownership on the server; never accept customer/run/Store IDs from the client.
      const run = await tx.kioskTryOnRun.findFirst({
        where: {
          customerId: customer.id,
          status: "COMPLETED",
          resultAssetId: input.resultAssetId,
          resultAsset: {
            purpose: "RESULT",
            session: { customerId: customer.id },
            readyAt: { not: null },
            deletedAt: null,
            storageDeletedAt: null,
            expiresAt: { gt: new Date() },
          },
        },
        select: { id: true },
      });
      if (!run)
        fail(
          404,
          "CONTENT_REPORT_RESULT_NOT_FOUND",
          "This generated image is unavailable.",
        );
      const report = await tx.contentReport.create({
        data: {
          id: createSelfxId(),
          customerId: customer.id,
          runId: run.id,
          resultAssetId: input.resultAssetId,
          reason: input.reason,
          comment,
          requestFingerprint: fingerprint,
        },
        select: { id: true },
      });
      return { id: report.id, submitted: true };
    });
  }

  async list(query: ContentReportsQuery) {
    const where: Prisma.ContentReportWhereInput = {
      customer: { status: { not: "DELETED" }, deletedAt: null },
      ...(query.status ? { status: query.status } : {}),
      ...(query.reason ? { reason: query.reason } : {}),
    };
    const [data, total] = await this.db.$transaction([
      this.db.contentReport.findMany({
        where,
        select: reportSummary,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.db.contentReport.count({ where }),
    ]);
    return { data, total, page: query.page, pageSize: query.pageSize };
  }

  private async report(id: string) {
    const report = await this.db.contentReport.findFirst({
      where: { id, customer: { status: { not: "DELETED" }, deletedAt: null } },
    });
    if (!report)
      fail(404, "CONTENT_REPORT_NOT_FOUND", "Content report not found.");
    return report;
  }

  private async resultAsset(report: ContentReport) {
    return this.db.tryOnAsset.findFirst({
      where: {
        id: report.resultAssetId,
        purpose: "RESULT",
        session: {
          customerId: report.customerId,
          customer: { status: { not: "DELETED" }, deletedAt: null },
        },
        resultForRuns: {
          some: {
            id: report.runId,
            customerId: report.customerId,
            status: "COMPLETED",
          },
        },
        readyAt: { not: null },
        deletedAt: null,
        storageDeletedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        storageKey: true,
        contentType: true,
        expiresAt: true,
      },
    });
  }

  async detail(id: string, actorUserId: string) {
    const report = await this.report(id);
    const asset = await this.resultAsset(report);
    await this.db.auditLog.create({
      data: {
        id: createSelfxId(),
        actorUserId,
        action: "CONTENT_REPORT_VIEWED",
        resourceType: "content_report",
        resourceId: id,
      },
    });
    // Deliberately omit storage keys, provider IDs, original photos and customer contact details.
    return {
      id: report.id,
      customerId: report.customerId,
      runId: report.runId,
      resultAssetId: report.resultAssetId,
      reason: report.reason,
      comment: report.comment,
      status: report.status,
      reviewNotes: report.reviewNotes,
      reviewedByUserId: report.reviewedByUserId,
      reviewedAt: report.reviewedAt,
      version: report.version,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      imageAvailable: Boolean(asset),
      imageExpiresAt: asset?.expiresAt ?? null,
    };
  }

  async image(id: string, actorUserId: string) {
    const report = await this.report(id);
    const asset = await this.resultAsset(report);
    if (!asset)
      fail(
        404,
        "CONTENT_REPORT_IMAGE_UNAVAILABLE",
        "Image no longer available.",
      );
    let body: Buffer;
    try {
      body = await this.storage.readObject(
        asset.storageKey,
        20 * 1024 * 1024,
        60000,
      );
    } catch {
      fail(
        503,
        "CONTENT_REPORT_IMAGE_UNAVAILABLE",
        "Image could not be loaded. Please try again.",
      );
    }
    // Recheck after storage I/O so expiry/deletion during retrieval fails closed.
    if (!(await this.resultAsset(report)))
      fail(
        404,
        "CONTENT_REPORT_IMAGE_UNAVAILABLE",
        "Image no longer available.",
      );
    await this.db.auditLog.create({
      data: {
        id: createSelfxId(),
        actorUserId,
        action: "CONTENT_REPORT_IMAGE_VIEWED",
        resourceType: "content_report",
        resourceId: id,
      },
    });
    return { body, contentType: asset.contentType ?? "image/png" };
  }

  async review(id: string, actorUserId: string, input: ReviewContentReportDto) {
    return this.db.$transaction(async (tx) => {
      const current = await tx.contentReport.findFirst({
        where: {
          id,
          customer: { status: { not: "DELETED" }, deletedAt: null },
        },
      });
      if (!current)
        fail(404, "CONTENT_REPORT_NOT_FOUND", "Content report not found.");
      const reviewNotes =
        input.reviewNotes === undefined
          ? current.reviewNotes
          : input.reviewNotes.trim() || null;
      if (current.version !== input.version) {
        if (
          current.version === input.version + 1 &&
          current.status === input.status &&
          current.reviewNotes === reviewNotes &&
          current.reviewedByUserId === actorUserId
        )
          return { id: current.id, version: current.version };
        fail(
          409,
          "CONTENT_REPORT_REVIEW_CONFLICT",
          "This report changed. Reload it before saving your review.",
        );
      }
      const changed = await tx.contentReport.updateMany({
        where: { id, version: input.version },
        data: {
          status: input.status,
          reviewNotes,
          reviewedByUserId: actorUserId,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
      });
      if (!changed.count)
        fail(
          409,
          "CONTENT_REPORT_REVIEW_CONFLICT",
          "This report changed. Reload it before saving your review.",
        );
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId,
          action: "CONTENT_REPORT_REVIEWED",
          resourceType: "content_report",
          resourceId: id,
          metadata: {
            fromStatus: current.status,
            toStatus: input.status,
            version: input.version + 1,
          },
        },
      });
      return { id, version: input.version + 1 };
    });
  }
}
