import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { IsIn, IsOptional } from "class-validator";
import { PrismaService } from "../database/prisma.service.js";

export class CustomerMetricsQuery {
  @IsOptional()
  @IsIn(["today", "7d", "30d", "90d"])
  range?: "today" | "7d" | "30d" | "90d";
}

@Injectable()
export class CustomerMetricsService {
  constructor(private readonly db: PrismaService) {}

  async summary(input: CustomerMetricsQuery) {
    const to = new Date(),
      preset = input.range ?? "30d";
    const from =
      preset === "today"
        ? new Date(
            Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
          )
        : new Date(to.getTime() - Number(preset.slice(0, -1)) * 86400000);
    const base = {
      range: { preset, from: from.toISOString(), to: to.toISOString() },
      updatedAt: to.toISOString(),
      unavailable: ["tryOns", "personalBilling", "storeQr"] as const,
    };
    // Existing deployments may not have activated/migrated customer accounts yet.
    if (process.env.SELFX_CUSTOMER_AUTH_ENABLED !== "true") {
      return {
        ...base,
        available: false,
        totals: null,
        daily: [],
        methods: [],
      };
    }
    return this.db.$transaction(
      async (tx) => {
        const period = { gte: from, lt: to };
        const [
          total,
          newAccounts,
          recentlyActive,
          verified,
          pending,
          suspended,
          daily,
          methods,
        ] = await Promise.all([
          tx.customer.count({ where: { status: { not: "DELETED" } } }),
          tx.customer.count({
            where: { status: { not: "DELETED" }, createdAt: period },
          }),
          tx.customer.count({
            where: { status: "ACTIVE", lastActiveAt: period },
          }),
          tx.customer.count({ where: { status: "ACTIVE" } }),
          tx.customer.count({ where: { status: "PENDING_VERIFICATION" } }),
          tx.customer.count({ where: { status: "SUSPENDED" } }),
          tx.$queryRaw<Array<{ date: string; accounts: number }>>`
          SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
            COUNT(*)::int AS accounts FROM customers
          WHERE status <> 'DELETED' AND created_at >= ${from} AND created_at < ${to}
          GROUP BY date ORDER BY date`,
          tx.customerIdentity.groupBy({
            by: ["provider"],
            where: { customer: { status: "ACTIVE" } },
            _count: { _all: true },
          }),
        ]);
        const byDate = new Map(daily.map((row) => [row.date, row.accounts]));
        const points = [];
        for (
          let day = new Date(
            Date.UTC(
              from.getUTCFullYear(),
              from.getUTCMonth(),
              from.getUTCDate(),
            ),
          );
          day < to;
          day = new Date(day.getTime() + 86400000)
        ) {
          const date = day.toISOString().slice(0, 10);
          points.push({ date, accounts: byDate.get(date) ?? 0 });
        }
        return {
          ...base,
          available: true,
          totals: {
            total,
            newAccounts,
            recentlyActive,
            verified,
            pending,
            suspended,
          },
          daily: points,
          methods: methods.map((row) => ({
            provider: row.provider,
            accounts: row._count._all,
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
