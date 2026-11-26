import { createHash } from "node:crypto";
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma, type CustomerWardrobeItem } from "@prisma/client";
import sharp from "sharp";
import { PrismaService } from "../database/prisma.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { validateTechnicalImageBuffer } from "../common/image-validation.js";

export const WARDROBE_CATEGORIES = [
  "TOPS",
  "JACKETS",
  "BOTTOMS",
  "DRESSES",
  "INDIAN_WEAR",
  "OTHER",
] as const;
export type WardrobeCategory = (typeof WARDROBE_CATEGORIES)[number];
export type WardrobeMetadata = {
  name: string;
  category: WardrobeCategory;
  colour?: string;
  notes?: string;
};
type Principal = { id: string; securityVersion: number };
const notFound = () =>
  new ApiErrorException(
    404,
    "WARDROBE_ITEM_NOT_FOUND",
    "This garment is no longer in your wardrobe.",
  );
const hash = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");

export async function normalizeWardrobePhoto(body: Buffer, mime: string) {
  try {
    const meta = validateTechnicalImageBuffer({
      buffer: body,
      declaredContentType: mime,
      maxBytes: 16 * 1024 * 1024,
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
      .resize({
        width: 2048,
        height: 2560,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    throw new ApiErrorException(
      400,
      "WARDROBE_PHOTO_INVALID",
      "Choose a JPEG, PNG or WebP photo up to 16 MB, at least 256 pixels on each side and no more than 8192 pixels on either side.",
    );
  }
}

@Injectable()
export class CustomerWardrobeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CustomerWardrobeService.name);
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
        this.logger.warn({ event: "wardrobe_cleanup_pending" }),
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
    return customer;
  }
  private metadata(input: WardrobeMetadata) {
    return {
      name: input.name.trim(),
      category: input.category,
      colour: input.colour?.trim() || null,
      notes: input.notes?.trim() || null,
    };
  }
  private dto(row: CustomerWardrobeItem) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      colour: row.colour,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      ready: Boolean(row.readyAt),
    };
  }
  async list(
    customerId: string,
    input: { page?: number; category?: WardrobeCategory; search?: string },
  ) {
    const page = input.page ?? 1,
      pageSize = 24;
    const where: Prisma.CustomerWardrobeItemWhereInput = {
      customerId,
      deletedAt: null,
      readyAt: { not: null },
      customer: { status: "ACTIVE" },
      ...(input.category ? { category: input.category } : {}),
      ...(input.search?.trim()
        ? { name: { contains: input.search.trim(), mode: "insensitive" } }
        : {}),
    };
    const rows = await this.db.customerWardrobeItem.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize + 1,
    });
    return {
      items: rows.slice(0, pageSize).map((row) => this.dto(row)),
      page,
      hasMore: rows.length > pageSize,
    };
  }
  async create(principal: Principal, id: string, input: WardrobeMetadata) {
    const metadata = this.metadata(input),
      requestHash = hash(JSON.stringify(metadata));
    const row = await this.db.$transaction(async (tx) => {
      const customer = await this.lock(tx, principal);
      const existing = await tx.customerWardrobeItem.findUnique({
        where: { id },
      });
      if (existing) {
        if (existing.customerId !== principal.id || existing.deletedAt)
          throw notFound();
        if (existing.requestHash !== requestHash)
          throw new ApiErrorException(
            409,
            "WARDROBE_REQUEST_CHANGED",
            "This upload changed. Start again to add this garment.",
          );
        return existing;
      }
      return tx.customerWardrobeItem.create({
        data: {
          id,
          customerId: principal.id,
          ...metadata,
          requestHash,
          storageKey: `customer-mobile/wardrobe/${principal.id}/${id}`,
          termsVersion: customer.termsVersion,
          termsAcceptedAt: customer.termsAcceptedAt,
          retentionVersion: "2026-11-26-wardrobe",
          retentionStatement:
            "Private wardrobe garment photos stay until deleted, including through Delete my photos or account deletion. Temporary Try-On copies expire within seven days.",
        },
      });
    });
    return { item: this.dto(row) };
  }
  async upload(principal: Principal, id: string, body: Buffer, mime: string) {
    const bytes = await normalizeWardrobePhoto(body, mime),
      contentHash = hash(bytes);
    const row = await this.db.$transaction(async (tx) => {
      await this.lock(tx, principal);
      const item = await tx.customerWardrobeItem.findFirst({
        where: { id, customerId: principal.id, deletedAt: null },
      });
      if (!item) throw notFound();
      if (item.contentHash && item.contentHash !== contentHash)
        throw new ApiErrorException(
          409,
          "WARDROBE_REQUEST_CHANGED",
          "This upload changed. Start again to add this garment.",
        );
      if (!item.contentHash)
        await tx.customerWardrobeItem.update({
          where: { id },
          data: { contentHash },
        });
      return item;
    });
    if (row.readyAt) return { item: this.dto(row) };
    try {
      await this.storage.putObject({
        key: row.storageKey,
        body: bytes,
        contentType: "image/jpeg",
        timeoutMs: 60000,
      });
      const ready = await this.db.$transaction(async (tx) => {
        await this.lock(tx, principal);
        const updated = await tx.customerWardrobeItem.updateMany({
          where: { id, customerId: principal.id, deletedAt: null },
          data: { readyAt: new Date() },
        });
        if (!updated.count) throw notFound();
        return tx.customerWardrobeItem.findUniqueOrThrow({ where: { id } });
      });
      return { item: this.dto(ready) };
    } catch (error) {
      // A completed put may race erasure. Always make its object eligible for
      // deletion again, including if cleanup already saw an absent object.
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${principal.id}::uuid FOR UPDATE`;
        const deleted = await tx.customerWardrobeItem.findFirst({
          where: { id, customerId: principal.id, deletedAt: { not: null } },
        });
        if (deleted)
          await tx.customerWardrobeItem.update({
            where: { id },
            data: {
              storageDeletedAt: null,
              // Monotonic even for completions within the same millisecond.
              updatedAt: new Date(
                Math.max(Date.now(), deleted.updatedAt.getTime() + 1),
              ),
            },
          });
      });
      if (error instanceof ApiErrorException) throw error;
      throw new ApiErrorException(
        503,
        "WARDROBE_UPLOAD_FAILED",
        "Your garment could not be saved. Please try again.",
      );
    }
  }
  async content(customerId: string, id: string) {
    const row = await this.db.customerWardrobeItem.findFirst({
      where: {
        id,
        customerId,
        deletedAt: null,
        readyAt: { not: null },
        customer: { status: "ACTIVE" },
      },
    });
    if (!row) throw notFound();
    return this.storage.readObject(row.storageKey, 16 * 1024 * 1024, 30000);
  }
  async update(principal: Principal, id: string, input: WardrobeMetadata) {
    const row = await this.db.$transaction(async (tx) => {
      await this.lock(tx, principal);
      const updated = await tx.customerWardrobeItem.updateMany({
        where: {
          id,
          customerId: principal.id,
          deletedAt: null,
          readyAt: { not: null },
        },
        data: this.metadata(input),
      });
      if (!updated.count) throw notFound();
      return tx.customerWardrobeItem.findUniqueOrThrow({ where: { id } });
    });
    return { item: this.dto(row) };
  }
  async remove(principal: Principal, id: string) {
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, principal);
      const item = await tx.customerWardrobeItem.findFirst({
        where: { id, customerId: principal.id },
      });
      if (!item) throw notFound();
      await tx.customerWardrobeItem.updateMany({
        where: { id, customerId: principal.id, deletedAt: null },
        data: {
          deletedAt: new Date(),
          readyAt: null,
          name: "Deleted garment",
          colour: null,
          notes: null,
        },
      });
    });
    // Storage cleanup retries independently; logical deletion takes effect now.
    await this.cleanup().catch(() =>
      this.logger.warn({ event: "wardrobe_cleanup_pending" }),
    );
    return { deleted: true };
  }
  async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const now = new Date();
      const rows = await this.db.customerWardrobeItem.findMany({
        where: {
          storageDeletedAt: null,
          OR: [
            { deletedAt: { not: null } },
            { customer: { status: "DELETED" } },
            {
              readyAt: null,
              createdAt: { lt: new Date(Date.now() - 5 * 60000) },
            },
          ],
        },
        take: 100,
      });
      for (const row of rows) {
        try {
          // Recheck under the same owner lock used by uploads. A draft may have
          // become ready after the candidate query; never erase that saved item.
          const claim = await this.db.$transaction(async (tx) => {
            await tx.$queryRaw`SELECT id FROM customers WHERE id = ${row.customerId}::uuid FOR UPDATE`;
            const current = await tx.customerWardrobeItem.findUnique({
              where: { id: row.id },
              include: { customer: { select: { status: true } } },
            });
            if (!current || current.storageDeletedAt) return null;
            if (
              !current.deletedAt &&
              current.customer.status !== "DELETED" &&
              (current.readyAt ||
                current.createdAt.getTime() >= now.getTime() - 5 * 60000)
            )
              return null;
            return tx.customerWardrobeItem.update({
              where: { id: row.id },
              data: {
                deletedAt: current.deletedAt ?? now,
                readyAt: null,
                name: "Deleted garment",
                colour: null,
                notes: null,
                updatedAt: new Date(
                  Math.max(Date.now(), current.updatedAt.getTime() + 1),
                ),
              },
            });
          });
          if (!claim) continue;
          await this.storage.deleteObject(row.storageKey);
          await this.db.customerWardrobeItem.updateMany({
            // A late put resets updatedAt and the deletion marker. Do not
            // overwrite that signal after deleting an earlier object version.
            where: { id: row.id, updatedAt: claim.updatedAt },
            data: {
              storageDeletedAt: now,
            },
          });
        } catch {
          this.logger.warn({ event: "wardrobe_delete_retry", itemId: row.id });
        }
      }
    } finally {
      this.cleaning = false;
    }
  }
}
