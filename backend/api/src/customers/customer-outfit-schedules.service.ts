import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";

type Principal = { id: string; securityVersion: number };
export type OutfitScheduleInput = {
  date: string;
  occasion?: string;
  notes?: string;
  garmentIds: string[];
};
const include = {
  pieces: {
    orderBy: { position: "asc" as const },
    include: { wardrobeItem: true },
  },
};
type Schedule = Prisma.CustomerOutfitScheduleGetPayload<{
  include: typeof include;
}>;
const missing = () =>
  new ApiErrorException(
    404,
    "OUTFIT_SCHEDULE_NOT_FOUND",
    "This scheduled outfit is no longer available.",
  );
const conflict = () =>
  new ApiErrorException(
    409,
    "OUTFIT_SCHEDULE_CHANGED",
    "This scheduled outfit changed. Reopen it and try again.",
  );
export function parseOutfitDate(value: string) {
  if (!/^(19|20|21)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))
    throw new ApiErrorException(
      400,
      "OUTFIT_DATE_INVALID",
      "Choose a valid calendar date.",
    );
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  )
    throw new ApiErrorException(
      400,
      "OUTFIT_DATE_INVALID",
      "Choose a valid calendar date.",
    );
  return date;
}
@Injectable()
export class CustomerOutfitSchedulesService {
  constructor(private readonly db: PrismaService) {}
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
  private normalized(input: OutfitScheduleInput) {
    if (
      input.garmentIds.length < 1 ||
      input.garmentIds.length > 20 ||
      new Set(input.garmentIds).size !== input.garmentIds.length
    )
      throw new ApiErrorException(
        400,
        "OUTFIT_PIECES_INVALID",
        "Choose between 1 and 20 different wardrobe pieces.",
      );
    const data = {
      date: input.date,
      occasion: input.occasion?.trim() || null,
      notes: input.notes?.trim() || null,
      garmentIds: input.garmentIds,
    };
    return {
      data,
      scheduledDate: parseOutfitDate(input.date),
      fingerprint: createHash("sha256")
        .update(JSON.stringify(data))
        .digest("hex"),
    };
  }
  private dto(row: Schedule) {
    return {
      id: row.id,
      date: row.scheduledDate.toISOString().slice(0, 10),
      occasion: row.occasion,
      notes: row.notes,
      version: row.version,
      pieces: row.pieces.map((piece) => {
        const garment = piece.wardrobeItem;
        return {
          id: piece.id,
          garment:
            garment &&
            garment.customerId === row.customerId &&
            !garment.deletedAt &&
            garment.readyAt
              ? {
                  id: garment.id,
                  name: garment.name,
                  category: garment.category,
                  colour: garment.colour,
                }
              : null,
        };
      }),
    };
  }
  private async validatePieces(
    tx: Prisma.TransactionClient,
    customerId: string,
    garmentIds: string[],
  ) {
    const count = await tx.customerWardrobeItem.count({
      where: {
        id: { in: garmentIds },
        customerId,
        deletedAt: null,
        readyAt: { not: null },
      },
    });
    if (count !== garmentIds.length)
      throw new ApiErrorException(
        400,
        "OUTFIT_GARMENT_UNAVAILABLE",
        "Some garments are no longer available. Choose from your wardrobe again.",
      );
  }
  async list(
    customerId: string,
    input: { from: string; to: string; day?: string; page?: number },
  ) {
    const from = parseOutfitDate(input.from),
      to = parseOutfitDate(input.to),
      day = input.day ? parseOutfitDate(input.day) : undefined;
    if (
      to < from ||
      to.getTime() - from.getTime() > 30 * 86400000 ||
      (day && (day < from || day > to))
    )
      throw new ApiErrorException(
        400,
        "OUTFIT_DATE_RANGE_INVALID",
        "Choose a date range of up to 31 days.",
      );
    const page = input.page ?? 1,
      pageSize = 25;
    const scope = {
      customerId,
      deletedAt: null,
      customer: { status: "ACTIVE" as const },
    };
    const [rows, days, garment] = await Promise.all([
      this.db.customerOutfitSchedule.findMany({
        where: { ...scope, scheduledDate: day ?? { gte: from, lte: to } },
        include,
        orderBy: [
          { scheduledDate: "asc" },
          { createdAt: "asc" },
          { id: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize + 1,
      }),
      this.db.customerOutfitSchedule.groupBy({
        by: ["scheduledDate"],
        where: { ...scope, scheduledDate: { gte: from, lte: to } },
        _count: { _all: true },
        orderBy: { scheduledDate: "asc" },
      }),
      this.db.customerWardrobeItem.findFirst({
        where: {
          customerId,
          deletedAt: null,
          readyAt: { not: null },
          customer: { status: "ACTIVE" },
        },
        select: { id: true },
      }),
    ]);
    return {
      items: rows.slice(0, pageSize).map((row) => this.dto(row)),
      page,
      hasMore: rows.length > pageSize,
      hasWardrobeItems: Boolean(garment),
      days: days.map((entry) => ({
        date: entry.scheduledDate.toISOString().slice(0, 10),
        count: entry._count._all,
      })),
    };
  }
  async create(principal: Principal, id: string, input: OutfitScheduleInput) {
    const { data, scheduledDate, fingerprint } = this.normalized(input);
    const row = await this.db.$transaction(async (tx) => {
      await this.lock(tx, principal);
      const existing = await tx.customerOutfitSchedule.findUnique({
        where: { id },
        include,
      });
      if (existing) {
        if (existing.customerId !== principal.id || existing.deletedAt)
          throw missing();
        if (existing.createFingerprint !== fingerprint) throw conflict();
        return existing;
      }
      await this.validatePieces(tx, principal.id, data.garmentIds);
      return tx.customerOutfitSchedule.create({
        data: {
          id,
          customerId: principal.id,
          scheduledDate,
          occasion: data.occasion,
          notes: data.notes,
          createFingerprint: fingerprint,
          currentFingerprint: fingerprint,
          pieces: {
            create: data.garmentIds.map((wardrobeItemId, position) => ({
              id: createSelfxId(),
              wardrobeItemId,
              position,
            })),
          },
        },
        include,
      });
    });
    return { item: this.dto(row) };
  }
  async update(
    principal: Principal,
    id: string,
    version: number,
    input: OutfitScheduleInput,
  ) {
    const { data, scheduledDate, fingerprint } = this.normalized(input);
    const row = await this.db.$transaction(async (tx) => {
      await this.lock(tx, principal);
      const existing = await tx.customerOutfitSchedule.findFirst({
        where: { id, customerId: principal.id, deletedAt: null },
        include,
      });
      if (!existing) throw missing();
      if (existing.version !== version) {
        if (existing.currentFingerprint === fingerprint) return existing;
        throw conflict();
      }
      await this.validatePieces(tx, principal.id, data.garmentIds);
      await tx.customerOutfitSchedulePiece.deleteMany({
        where: { scheduleId: id },
      });
      return tx.customerOutfitSchedule.update({
        where: { id },
        data: {
          scheduledDate,
          occasion: data.occasion,
          notes: data.notes,
          currentFingerprint: fingerprint,
          version: { increment: 1 },
          pieces: {
            create: data.garmentIds.map((wardrobeItemId, position) => ({
              id: createSelfxId(),
              wardrobeItemId,
              position,
            })),
          },
        },
        include,
      });
    });
    return { item: this.dto(row) };
  }
  async remove(principal: Principal, id: string) {
    await this.db.$transaction(async (tx) => {
      await this.lock(tx, principal);
      const row = await tx.customerOutfitSchedule.findFirst({
        where: { id, customerId: principal.id },
      });
      if (!row) throw missing();
      if (!row.deletedAt) {
        await tx.customerOutfitSchedulePiece.deleteMany({
          where: { scheduleId: id },
        });
        await tx.customerOutfitSchedule.update({
          where: { id },
          data: {
            deletedAt: new Date(),
            occasion: null,
            notes: null,
            scheduledDate: new Date("1970-01-01T00:00:00.000Z"),
            createFingerprint: "0".repeat(64),
            currentFingerprint: "0".repeat(64),
            version: { increment: 1 },
          },
        });
      }
    });
    return { deleted: true };
  }
}
