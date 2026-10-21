import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { ApkValidator } from "./apk-validator.js";

export const MAX_APK_BYTES = 200 * 1024 * 1024;
const publicFields = {
  id: true,
  packageName: true,
  versionName: true,
  versionCode: true,
  architecture: true,
  minSdk: true,
  sizeBytes: true,
  sha256: true,
  signerSha256: true,
  filename: true,
  releaseNotes: true,
  status: true,
  recommended: true,
  revision: true,
  createdAt: true,
  publishedAt: true,
} as const;

@Injectable()
export class AppReleasesService {
  private uploads = new Set<string>();
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly validator: ApkValidator,
  ) {}
  async upload(userId: string, buffer: Buffer, releaseNotes: string) {
    if (
      buffer.length < 4 ||
      buffer.length > MAX_APK_BYTES ||
      buffer.readUInt32LE(0) !== 0x04034b50
    )
      throw new ApiErrorException(
        400,
        "APK_INVALID_FILE",
        "Choose an APK file no larger than 200 MiB.",
      );
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const existing = await this.prisma.appRelease.findUnique({
      where: { sha256 },
      select: publicFields,
    });
    if (existing) return existing;
    this.validator.configuration();
    const directory = await mkdtemp(join(tmpdir(), "selfx-apk-"));
    try {
      const path = join(directory, "release.apk");
      await writeFile(path, buffer, { mode: 0o600 });
      const metadata = await this.validator.inspect(path);
      const id = createSelfxId();
      const objectKey = `app-releases/${id}/${sha256}.apk`;
      await this.storage.putObject({
        key: objectKey,
        contentType: "application/vnd.android.package-archive",
        body: buffer,
      });
      try {
        return await this.prisma.$transaction(async (tx) => {
          const release = await tx.appRelease.create({
            data: {
              id,
              ...metadata,
              sha256,
              objectKey,
              filename: `selfx-kiosk-${metadata.versionCode}-${metadata.architecture.toLowerCase()}.apk`,
              sizeBytes: buffer.length,
              uploadedById: userId,
              releaseNotes,
            },
            select: publicFields,
          });
          await tx.auditLog.create({
            data: {
              id: createSelfxId(),
              actorUserId: userId,
              action: "APP_RELEASE_UPLOADED",
              resourceType: "app_release",
              resourceId: id,
              metadata: {
                sha256,
                versionCode: metadata.versionCode,
                architecture: metadata.architecture,
              },
            },
          });
          return release;
        });
      } catch (error) {
        await this.storage.deleteObject(objectKey).catch(() => {});
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const duplicate = await this.prisma.appRelease.findUnique({
            where: { sha256 },
            select: publicFields,
          });
          if (duplicate) return duplicate;
          throw new ApiErrorException(
            409,
            "APP_RELEASE_VERSION_CONFLICT",
            "This version code and architecture already exist. Build a new version code.",
          );
        }
        throw error;
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  beginUpload(userId: string) {
    if (this.uploads.has(userId) || this.uploads.size >= 2)
      throw new ApiErrorException(
        429,
        "APK_UPLOAD_BUSY",
        "An upload is already in progress. Try again shortly.",
      );
    this.uploads.add(userId);
  }
  endUpload(userId: string) {
    this.uploads.delete(userId);
  }
  async list(publishedOnly: boolean, cursor?: string, pageSize = 25) {
    const rows = await this.prisma.appRelease.findMany({
      where: {
        ...(publishedOnly ? { status: "PUBLISHED" as const } : {}),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: pageSize + 1,
      select: {
        ...publicFields,
        ...(!publishedOnly
          ? { uploadedBy: { select: { displayName: true, email: true } } }
          : {}),
      },
    });
    const hasMore = rows.length > pageSize;
    const data = rows.slice(0, pageSize);
    return { data, hasMore, nextCursor: hasMore ? data.at(-1)!.id : null };
  }
  async change(
    userId: string,
    id: string,
    action: "publish" | "recommend" | "retire",
    revision: number,
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Serialize lifecycle changes, including recommendation replacement.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(2101021)`;
        const release = await tx.appRelease.findUnique({ where: { id } });
        if (!release)
          throw new ApiErrorException(
            404,
            "APP_RELEASE_NOT_FOUND",
            "Release was not found.",
          );
        if (release.revision !== revision)
          throw new ApiErrorException(
            409,
            "APP_RELEASE_STALE",
            "This release changed. Refresh before trying again.",
          );
        if (
          (action === "publish" && release.status !== "DRAFT") ||
          (action === "recommend" && release.status !== "PUBLISHED") ||
          (action === "retire" && release.status === "RETIRED")
        )
          throw new ApiErrorException(
            409,
            "APP_RELEASE_STATE_INVALID",
            "This action is unavailable for the current release state.",
          );
        if (action === "publish") {
          if (release.signerSha256 !== this.validator.configuration().signer)
            throw new ApiErrorException(
              409,
              "APP_RELEASE_SIGNER_CHANGED",
              "This draft does not match the currently trusted signer.",
            );
          const newer = await tx.appRelease.findFirst({
            where: {
              architecture: release.architecture,
              packageName: release.packageName,
              status: "PUBLISHED",
              versionCode: { gte: release.versionCode },
            },
          });
          if (newer)
            throw new ApiErrorException(
              409,
              "APP_RELEASE_DOWNGRADE",
              "Publish a version code newer than currently published releases for this architecture.",
            );
        }
        if (action === "recommend")
          await tx.appRelease.updateMany({
            where: { architecture: release.architecture, recommended: true },
            data: { recommended: false, revision: { increment: 1 } },
          });
        const data =
          action === "publish"
            ? { status: "PUBLISHED" as const, publishedAt: new Date() }
            : action === "retire"
              ? { status: "RETIRED" as const, recommended: false }
              : { recommended: true };
        const result = await tx.appRelease.update({
          where: { id },
          data: { ...data, revision: { increment: 1 } },
          select: publicFields,
        });
        await tx.auditLog.create({
          data: {
            id: createSelfxId(),
            actorUserId: userId,
            action: `APP_RELEASE_${action.toUpperCase()}`,
            resourceType: "app_release",
            resourceId: id,
          },
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ApiErrorException(
          409,
          "APP_RELEASE_CONFLICT",
          "Release changed. Refresh and retry.",
        );
      throw error;
    }
  }
  async download(id: string, publishedOnly: boolean) {
    const release = await this.prisma.appRelease.findFirst({
      where: { id, ...(publishedOnly ? { status: "PUBLISHED" as const } : {}) },
    });
    if (!release)
      throw new ApiErrorException(
        404,
        "APP_RELEASE_NOT_FOUND",
        "Release is unavailable.",
      );
    return {
      url: this.storage.createReadUrl({
        key: release.objectKey,
        expiresInSeconds: 60,
        responseContentType: "application/vnd.android.package-archive",
        responseContentDisposition: `attachment; filename="${release.filename}"`,
      }),
      expiresInSeconds: 60,
    };
  }
}
