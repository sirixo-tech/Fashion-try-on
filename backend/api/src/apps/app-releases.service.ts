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
import {
  ApkValidator,
  releasePackage,
  type ReleaseApp,
} from "./apk-validator.js";

export const MAX_APK_BYTES = 200 * 1024 * 1024;
const publicFields = {
  id: true,
  customAppId: true,
  customApp: {
    select: { id: true, slug: true, name: true, description: true },
  },
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
  async upload(
    userId: string,
    buffer: Buffer,
    releaseNotes: string,
    app: ReleaseApp = "KIOSK",
  ) {
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
    if (existing) {
      if (existing.packageName !== releasePackage(app))
        throw new ApiErrorException(
          400,
          "APK_WRONG_APP",
          "This APK belongs to the other SelfX app.",
        );
      return existing;
    }
    this.validator.configuration(app);
    const directory = await mkdtemp(join(tmpdir(), "selfx-apk-"));
    try {
      const path = join(directory, "release.apk");
      await writeFile(path, buffer, { mode: 0o600 });
      const metadata = await this.validator.inspect(path, app);
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
              filename: `selfx-${app === "CUSTOMER" ? "mobile" : "kiosk"}-${metadata.versionCode}-${metadata.architecture.toLowerCase()}.apk`,
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
  async uploadCustom(
    userId: string,
    buffer: Buffer,
    releaseNotes: string,
    input: { companionAppId: string } | { name: string; description: string },
  ) {
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
    if (
      "name" in input &&
      (input.name.trim().length < 2 ||
        input.name.trim().length > 120 ||
        input.description.trim().length > 500)
    )
      throw new ApiErrorException(
        400,
        "COMPANION_APP_DETAILS_INVALID",
        "Enter an app name (2–120 characters) and a description no longer than 500 characters.",
      );

    const directory = await mkdtemp(join(tmpdir(), "selfx-apk-"));
    try {
      const path = join(directory, "release.apk");
      await writeFile(path, buffer, { mode: 0o600 });
      const registered =
        "companionAppId" in input
          ? await this.prisma.companionApp.findUnique({
              where: { id: input.companionAppId },
            })
          : null;
      if ("companionAppId" in input && !registered)
        throw new ApiErrorException(
          404,
          "COMPANION_APP_NOT_FOUND",
          "The selected app was not found. Refresh and try again.",
        );
      const metadata = await this.validator.inspectCustom(
        path,
        registered?.packageName,
        registered?.signerSha256,
      );
      const builtInPackage = [
        releasePackage("KIOSK"),
        releasePackage("CUSTOMER"),
      ].includes(metadata.packageName);
      if (builtInPackage)
        throw new ApiErrorException(
          409,
          "COMPANION_APP_BUILTIN_PACKAGE",
          "This APK belongs to a built-in SelfX app. Choose that app in the selector.",
        );

      let companionAppId = registered?.id ?? createSelfxId();
      let companionAppSlug = registered?.slug ?? "";
      let companionAppName = registered?.name ?? "";
      let companionAppDescription = registered?.description ?? "";
      const createCompanionApp = !registered;
      if (!registered) {
        const existingPackage = await this.prisma.companionApp.findUnique({
          where: { packageName: metadata.packageName },
        });
        if (existingPackage)
          throw new ApiErrorException(
            409,
            "COMPANION_APP_ALREADY_EXISTS",
            "This APK package is already registered. Select its existing app to upload another release.",
          );
        const requested = input as { name: string; description: string };
        const normalizedName = requested.name.trim();
        const slugBase =
          normalizedName
            .toLowerCase()
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80) || "app";
        const suffix = createHash("sha256")
          .update(metadata.packageName)
          .digest("hex")
          .slice(0, 10);
        companionAppSlug = `${slugBase}-${suffix}`;
        companionAppName = normalizedName;
        companionAppDescription = requested.description.trim();
      }

      const sha256 = createHash("sha256").update(buffer).digest("hex");
      const duplicate = await this.prisma.appRelease.findUnique({
        where: { sha256 },
        select: publicFields,
      });
      if (duplicate) {
        if (duplicate.customAppId === companionAppId) return duplicate;
        throw new ApiErrorException(
          409,
          "APK_ALREADY_ASSIGNED",
          "This APK has already been uploaded for another app.",
        );
      }

      const id = createSelfxId();
      const objectKey = `app-releases/${id}/${sha256}.apk`;
      const filename = `${companionAppSlug}-${metadata.versionCode}-${metadata.architecture.toLowerCase()}.apk`;
      await this.storage.putObject({
        key: objectKey,
        contentType: "application/vnd.android.package-archive",
        body: buffer,
      });
      try {
        return await this.prisma.$transaction(async (tx) => {
          if (createCompanionApp)
            await tx.companionApp.create({
              data: {
                id: companionAppId,
                slug: companionAppSlug,
                name: companionAppName,
                description: companionAppDescription,
                packageName: metadata.packageName,
                signerSha256: metadata.signerSha256,
                createdById: userId,
              },
            });
          const release = await tx.appRelease.create({
            data: {
              id,
              ...metadata,
              customAppId: companionAppId,
              sha256,
              objectKey,
              filename,
              sizeBytes: buffer.length,
              uploadedById: userId,
              releaseNotes,
            },
            select: publicFields,
          });
          if (createCompanionApp)
            await tx.auditLog.create({
              data: {
                id: createSelfxId(),
                actorUserId: userId,
                action: "COMPANION_APP_CREATED",
                resourceType: "companion_app",
                resourceId: companionAppId,
                metadata: { packageName: metadata.packageName },
              },
            });
          await tx.auditLog.create({
            data: {
              id: createSelfxId(),
              actorUserId: userId,
              action: "APP_RELEASE_UPLOADED",
              resourceType: "app_release",
              resourceId: id,
              metadata: {
                appId: companionAppId,
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
          const sameBinary = await this.prisma.appRelease.findUnique({
            where: { sha256 },
            select: publicFields,
          });
          if (sameBinary?.customAppId === companionAppId) return sameBinary;
          throw new ApiErrorException(
            409,
            "APP_RELEASE_VERSION_CONFLICT",
            "This version code and architecture already exist for the selected app. Build a new version code.",
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
  async list(
    publishedOnly: boolean,
    cursor?: string,
    pageSize = 25,
    app: ReleaseApp | "CUSTOM" | "ALL" = "KIOSK",
  ) {
    const rows = await this.prisma.appRelease.findMany({
      where: {
        ...(app === "ALL"
          ? {
              OR: [
                {
                  packageName: {
                    in: [releasePackage("KIOSK"), releasePackage("CUSTOMER")],
                  },
                  customAppId: null,
                },
                { customAppId: { not: null } },
              ],
            }
          : app === "CUSTOM"
            ? { customAppId: { not: null } }
            : { packageName: releasePackage(app), customAppId: null }),
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
    const data = rows.slice(0, pageSize).map((release) => ({
      ...release,
      app: release.customAppId
        ? ("CUSTOM" as const)
        : release.packageName === releasePackage("CUSTOMER")
          ? ("CUSTOMER" as const)
          : ("KIOSK" as const),
    }));
    const apps =
      !publishedOnly && (app === "ALL" || app === "CUSTOM")
        ? await this.prisma.companionApp.findMany({
            select: { id: true, slug: true, name: true, description: true },
            orderBy: { name: "asc" },
          })
        : undefined;
    return {
      data,
      apps,
      hasMore,
      nextCursor: hasMore ? data.at(-1)!.id : null,
    };
  }
  async listPublishedDownloads(
    cursor?: string,
    pageSize = 25,
    app?: ReleaseApp | "CUSTOM",
  ) {
    const rows = await this.prisma.appRelease.findMany({
      where: {
        status: "PUBLISHED",
        ...(app === "CUSTOM"
          ? { customAppId: { not: null } }
          : app
            ? { packageName: releasePackage(app), customAppId: null }
            : {
                OR: [
                  {
                    packageName: {
                      in: [releasePackage("KIOSK"), releasePackage("CUSTOMER")],
                    },
                    customAppId: null,
                  },
                  { customAppId: { not: null } },
                ],
              }),
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { id: "desc" },
      take: pageSize + 1,
      select: publicFields,
    });
    const hasMore = rows.length > pageSize;
    const data = rows.slice(0, pageSize).map((release) => ({
      ...release,
      app: release.customAppId
        ? ("CUSTOM" as const)
        : release.packageName === releasePackage("CUSTOMER")
          ? ("CUSTOMER" as const)
          : ("KIOSK" as const),
    }));
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
          const registeredApp = release.customAppId
            ? await tx.companionApp.findUnique({
                where: { id: release.customAppId },
              })
            : null;
          const app: ReleaseApp =
            release.packageName === releasePackage("CUSTOMER")
              ? "CUSTOMER"
              : "KIOSK";
          const trustedPackage =
            registeredApp?.packageName ?? releasePackage(app);
          const trustedSigner =
            registeredApp?.signerSha256 ??
            this.validator.configuration(app).signer;
          if (
            release.packageName !== trustedPackage ||
            release.signerSha256 !== trustedSigner
          )
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
            where: {
              packageName: release.packageName,
              architecture: release.architecture,
              recommended: true,
            },
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
  async download(
    id: string,
    publishedOnly: boolean,
    app: ReleaseApp = "KIOSK",
  ) {
    const release = await this.prisma.appRelease.findFirst({
      where: {
        id,
        ...(publishedOnly
          ? { status: "PUBLISHED" as const, packageName: releasePackage(app) }
          : {}),
      },
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
  async isPublished(id: string) {
    const release = await this.prisma.appRelease.findUnique({
      where: { id },
      select: { status: true },
    });
    return release?.status === "PUBLISHED";
  }
  async downloadPublished(id: string) {
    const release = await this.prisma.appRelease.findFirst({
      where: {
        id,
        status: "PUBLISHED",
        OR: [
          {
            packageName: {
              in: [releasePackage("KIOSK"), releasePackage("CUSTOMER")],
            },
            customAppId: null,
          },
          { customAppId: { not: null } },
        ],
      },
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
  async customerUpdate(versionCode: number, architecture: string, sdk: number) {
    const release = await this.prisma.appRelease.findFirst({
      where: {
        packageName: releasePackage("CUSTOMER"),
        status: "PUBLISHED",
        versionCode: { gt: versionCode },
        architecture: { in: [architecture, "UNIVERSAL"] },
        minSdk: { lte: sdk },
      },
      orderBy: [{ versionCode: "desc" }, { id: "desc" }],
      select: publicFields,
    });
    return { update: release ?? null };
  }
}
