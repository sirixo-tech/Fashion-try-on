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
      unavailable: ["personalBilling"] as const,
    };
    // Existing deployments may not have activated/migrated customer accounts yet.
    if (process.env.SELFX_CUSTOMER_AUTH_ENABLED !== "true") {
      return {
        ...base,
        available: false,
        totals: null,
        daily: [],
        methods: [],
        experience: null,
        experienceDaily: [],
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
          runCounts,
          runDaily,
          personalCompleted,
          storeCompleted,
          storeVisits,
          visitDaily,
          credits,
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
          tx.kioskTryOnRun.groupBy({
            by: ["status"],
            where: { customerId: { not: null }, createdAt: period },
            _count: { _all: true },
          }),
          tx.$queryRaw<
            Array<{
              date: string;
              attempts: number;
              completed: number;
              failed: number;
              personalCompleted: number;
              storeCompleted: number;
            }>
          >`
          SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
            COUNT(*)::int AS attempts,
            COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completed,
            COUNT(*) FILTER (WHERE status = 'FAILED')::int AS failed,
            COUNT(*) FILTER (WHERE status = 'COMPLETED' AND organization_id IS NULL)::int AS "personalCompleted",
            COUNT(*) FILTER (WHERE status = 'COMPLETED' AND organization_id IS NOT NULL)::int AS "storeCompleted"
          FROM kiosk_try_on_runs
          WHERE customer_id IS NOT NULL AND created_at >= ${from} AND created_at < ${to}
          GROUP BY date ORDER BY date`,
          tx.kioskTryOnRun.count({
            where: {
              customerId: { not: null },
              organizationId: null,
              status: "COMPLETED",
              createdAt: period,
            },
          }),
          tx.kioskTryOnRun.count({
            where: {
              customerId: { not: null },
              organizationId: { not: null },
              status: "COMPLETED",
              createdAt: period,
            },
          }),
          tx.customerStoreVisit.count({ where: { createdAt: period } }),
          tx.$queryRaw<Array<{ date: string; storeVisits: number }>>`
          SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
            COUNT(*)::int AS "storeVisits"
          FROM customer_store_visits
          WHERE created_at >= ${from} AND created_at < ${to}
          GROUP BY date ORDER BY date`,
          tx.customerCreditAccount.aggregate({
            _sum: {
              trialCredits: true,
              usedCredits: true,
              reservedCredits: true,
            },
          }),
        ]);
        const byDate = new Map(daily.map((row) => [row.date, row.accounts]));
        const runsByDate = new Map(runDaily.map((row) => [row.date, row]));
        const visitsByDate = new Map(
          visitDaily.map((row) => [row.date, row.storeVisits]),
        );
        const points = [];
        const experiencePoints = [];
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
          const runs = runsByDate.get(date);
          experiencePoints.push({
            date,
            attempts: runs?.attempts ?? 0,
            completed: runs?.completed ?? 0,
            failed: runs?.failed ?? 0,
            personalCompleted: runs?.personalCompleted ?? 0,
            storeCompleted: runs?.storeCompleted ?? 0,
            storeVisits: visitsByDate.get(date) ?? 0,
          });
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
          experienceDaily: experiencePoints,
          methods: methods.map((row) => ({
            provider: row.provider,
            accounts: row._count._all,
          })),
          experience: {
            attempts: runCounts.reduce((sum, row) => sum + row._count._all, 0),
            completed:
              runCounts.find((row) => row.status === "COMPLETED")?._count
                ._all ?? 0,
            failed:
              runCounts.find((row) => row.status === "FAILED")?._count._all ??
              0,
            personalCompleted,
            storeCompleted,
            storeVisits,
            trialGranted: credits._sum.trialCredits ?? 0,
            trialUsed: credits._sum.usedCredits ?? 0,
            trialReserved: credits._sum.reservedCredits ?? 0,
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}
