import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import sharp from "sharp";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { validateTechnicalImageBuffer } from "../common/image-validation.js";
import { ApiErrorException } from "../common/api-error.exception.js";

export const PROFILE_PHOTO_VERSION = "2026-10-27";
export const PROFILE_PHOTO_CONSENT =
  "I allow SelfX to upload my selected profile photo. It is private to my account, is not used for Try-On, and expires within 7 days. I can change or remove it earlier.";
type Principal = { id: string; securityVersion: number };
const DAY = 86400000;

export async function normalizeProfilePhoto(body: Buffer, mime: string) {
  try {
    const meta = validateTechnicalImageBuffer({
      buffer: body,
      declaredContentType: mime,
      maxBytes: 5 * 1024 * 1024,
    });
    if (
      Math.min(meta.width, meta.height) < 256 ||
      Math.max(meta.width, meta.height) > 8192
    )
      throw new Error("Dimensions");
    return await sharp(body, {
      limitInputPixels: 8192 * 8192,
      animated: false,
      failOn: "warning",
    })
      .rotate()
      .resize(512, 512, { fit: "cover", position: "centre" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ApiErrorException(
      400,
      "PROFILE_PHOTO_INVALID",
      "Choose a JPEG, PNG or WebP photo up to 5 MB, at least 256 pixels on each side and no more than 8192 pixels on either side.",
    );
  }
}

@Injectable()
export class CustomerProfilePhotoService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CustomerProfilePhotoService.name);
  private timer?: ReturnType<typeof setInterval>;
  private cleaning = false;
  constructor(
    private readonly db: PrismaService,
    private readonly storage: ObjectStorageService,
  ) {}
  onModuleInit() {
    if (process.env.SELFX_CUSTOMER_AUTH_ENABLED !== "true") return;
    const clean = () =>
      void this.cleanup().catch(() =>
        this.logger.warn({ event: "profile_photo_cleanup_pending" }),
      );
    this.timer = setInterval(clean, 60000);
    this.timer.unref();
    clean();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  private async lock(tx: Prisma.TransactionClient, principal: Principal) {
    await tx.$queryRaw`SELECT id FROM customers WHERE id = ${principal.id}::uuid FOR UPDATE`;
    const customer = await tx.customer.findUnique({
      where: { id: principal.id },
    });
    if (
      !customer ||
      customer.status !== "ACTIVE" ||
      customer.securityVersion !== principal.securityVersion
    )
      throw new ApiErrorException(
        401,
        "CUSTOMER_UNAUTHORIZED",
        "Please sign in again.",
      );
  }
  async get(customerId: string) {
    const photo = await this.db.customerProfilePhoto.findFirst({
      where: {
        customerId,
        deletedAt: null,
        readyAt: { not: null },
        expiresAt: { gt: new Date() },
        customer: { status: "ACTIVE" },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return {
      photo: photo
        ? { id: photo.id, expiresAt: photo.expiresAt.toISOString() }
        : null,
    };
  }
  async content(customerId: string, id: string) {
    const photo = await this.db.customerProfilePhoto.findFirst({
      where: {
        id,
        customerId,
        deletedAt: null,
        readyAt: { not: null },
        expiresAt: { gt: new Date() },
        customer: { status: "ACTIVE" },
      },
    });
    if (!photo)
      throw new ApiErrorException(
        404,
        "PROFILE_PHOTO_NOT_FOUND",
        "This photo has expired or was deleted.",
      );
    return this.storage.readObject(photo.storageKey, 5 * 1024 * 1024, 30000);
  }
  async upload(
    principal: Principal,
    body: Buffer,
    mime: string,
    language: string,
  ) {
    const bytes = await normalizeProfilePhoto(body, mime);
    const id = createSelfxId(),
      storageKey = `customer-mobile/profile/${principal.id}/${id}`;
    const created = await this.db.$transaction(async (tx) => {
      await this.lock(tx, principal);
      return tx.customerProfilePhoto.create({
        data: {
          id,
          customerId: principal.id,
          storageKey,
          consentVersion: PROFILE_PHOTO_VERSION,
          consentStatement: PROFILE_PHOTO_CONSENT,
          consentLanguage: language,
          expiresAt: new Date(Date.now() + 7 * DAY),
        },
      });
    });
    try {
      await this.storage.putObject({
        key: storageKey,
        contentType: "image/jpeg",
        body: bytes,
        timeoutMs: 60000,
      });
      await this.db.$transaction(async (tx) => {
        await this.lock(tx, principal);
        const now = new Date();
        const active = await tx.customerProfilePhoto.updateMany({
          where: {
            id,
            customerId: principal.id,
            deletedAt: null,
            expiresAt: { gt: now },
          },
          data: { readyAt: now },
        });
        if (!active.count)
          throw new ApiErrorException(
            409,
            "PROFILE_PHOTO_CANCELLED",
            "Your photo upload was cancelled. Please try again.",
          );
        await tx.customerProfilePhoto.updateMany({
          where: { customerId: principal.id, id: { not: id }, deletedAt: null },
          data: { deletedAt: now, expiresAt: now },
        });
      });
      return { photo: { id, expiresAt: created.expiresAt.toISOString() } };
    } catch (error) {
      // Upload may have completed after a removal. Reset cleanup state so the
      // object is deleted again even if an earlier cleanup saw no object yet.
      await this.db.customerProfilePhoto.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          expiresAt: new Date(),
          storageDeletedAt: null,
        },
      });
      if (error instanceof ApiErrorException) throw error;
      throw new ApiErrorException(
        503,
        "PROFILE_PHOTO_UPLOAD_FAILED",
        "Your photo could not be uploaded. Please try again.",
      );
    }
  }
  async remove(principal: Principal) {
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, principal);
      await tx.customerProfilePhoto.updateMany({
        where: { customerId: principal.id, deletedAt: null },
        data: { deletedAt: new Date(), expiresAt: new Date() },
      });
    });
    await this.cleanup();
    return { photo: null };
  }
  async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const now = new Date(),
        stale = new Date(Date.now() - 5 * 60000);
      const rows = await this.db.customerProfilePhoto.findMany({
        where: {
          storageDeletedAt: null,
          OR: [
            { expiresAt: { lte: now } },
            { deletedAt: { not: null } },
            { customer: { status: "DELETED" } },
            { readyAt: null, createdAt: { lt: stale } },
          ],
        },
        take: 100,
      });
      for (const row of rows) {
        try {
          await this.storage.deleteObject(row.storageKey);
          await this.db.customerProfilePhoto.update({
            where: { id: row.id },
            data: { readyAt: null, deletedAt: now, storageDeletedAt: now },
          });
        } catch {
          this.logger.warn({
            event: "profile_photo_delete_retry",
            photoId: row.id,
          });
        }
      }
    } finally {
      this.cleaning = false;
    }
  }
}
