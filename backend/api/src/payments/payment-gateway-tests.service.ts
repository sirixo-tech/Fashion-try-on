import { createHash } from "node:crypto";
import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma, type PlatformPaymentTest } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { encryptProviderSecret } from "../integrations/provider-secret-cipher.js";
import { paymentEncryptionKey } from "./payment-settings.service.js";
import { decryptPaymentSnapshot } from "./payment-snapshots.js";
import {
  PhonePeDqrAdapter,
  type PhonePeDqrCredentials,
} from "./phonepe-dqr.adapter.js";
import { PhonePeTransport } from "./phonepe.transport.js";
import { paymentCallbackOrigin } from "./payment-execution-utils.js";
import {
  paymentDiagnostic,
  readPaymentDiagnostic,
  PaymentProviderError,
} from "./payment-diagnostics.js";
import type { ProviderPaymentStatus } from "./payment-adapter.js";
import type {
  SavePlatformPhonePeTestDto,
  StartPlatformPaymentTestDto,
} from "./platform-payment-tests.dto.js";

const provider = "PHONEPE";
const activeStatuses = ["PREPARING", "PENDING", "UNKNOWN"];
const summarySelect = {
  id: true,
  provider: true,
  environment: true,
  connectionVersion: true,
  status: true,
  amountMinor: true,
  currency: true,
  createdAt: true,
  expiresAt: true,
  confirmedAt: true,
  checkedAt: true,
  nextCheckAt: true,
  failureCode: true,
  providerReference: true,
  _count: { select: { events: true } },
  events: {
    where: { reportedStatus: "SUCCEEDED" },
    take: 1,
    select: { id: true },
  },
} satisfies Prisma.PlatformPaymentTestSelect;
type Summary = Prisma.PlatformPaymentTestGetPayload<{
  select: typeof summarySelect;
}>;

@Injectable()
export class PaymentGatewayTestsService {
  private readonly logger = new Logger(PaymentGatewayTestsService.name);
  // The historic database table names are retained for compatibility.
  // Every user-facing operation is bound to a Store or platform scope.
  private readonly buckets = new Map<
    string,
    { count: number; reset: number }
  >();
  constructor(
    private readonly prisma: PrismaService,
    private readonly transport: PhonePeTransport,
  ) {}

  async workspace(storeId: string | null = null) {
    const [connection, rows] = await Promise.all([
      this.connection(this.prisma, storeId),
      this.prisma.platformPaymentTest.findMany({
        where: { provider, scopeKey: scopeKey(storeId) },
        select: summarySelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
      }),
    ]);
    const latest = rows.find(
      (row) => row.connectionVersion === connection?.version,
    );
    let callbackConfigured = false;
    try {
      paymentCallbackOrigin();
      callbackConfigured = true;
    } catch {
      /* safe readiness metadata */
    }
    return {
      connection: connection
        ? { ...connection, updatedAt: connection.updatedAt.toISOString() }
        : null,
      executionEnabled: process.env.SELFX_PHONEPE_UAT_ENABLED === "true",
      callbackConfigured,
      testStatus: !connection
        ? "NOT_CONFIGURED"
        : !latest
          ? "NOT_TESTED"
          : latest.status === "SUCCEEDED"
            ? "PASSED"
            : latest.events.length
              ? "UNKNOWN"
              : latest.status === "FAILED"
                ? "FAILED"
                : latest.status === "UNKNOWN"
                  ? "UNKNOWN"
                  : "PENDING",
      tests: rows.map(summary),
    };
  }

  async save(actorId: string, input: SavePlatformPhonePeTestDto) {
    if (input.environment !== "UAT")
      fail(
        "PAYMENT_TEST_UAT_REQUIRED",
        "Platform testing accepts UAT credentials only.",
      );
    const { key, version: keyVersion } = paymentEncryptionKey();
    const encrypted = encryptProviderSecret(
      {
        scope: "PLATFORM_TEST",
        provider,
        environment: "UAT",
        merchantId: input.merchantId,
        providerId: input.providerId,
        providerStoreId: input.providerStoreId ?? "SELFX_PLATFORM_TEST",
        saltIndex: input.saltIndex,
        saltKey: input.saltKey,
      },
      key,
    );
    await this.prisma.$transaction(async (tx) => {
      await lock(tx);
      const old = await tx.platformPaymentTestConnection.findUnique({
        where: { provider },
      });
      revision(old?.version ?? 0, input.expectedVersion);
      await tx.platformPaymentTestConnection.upsert({
        where: { provider },
        create: {
          provider,
          environment: "UAT",
          ...encrypted,
          keyVersion,
          dqrAccessConfirmed: input.dqrAccessConfirmed ?? false,
        },
        update: {
          ...encrypted,
          keyVersion,
          version: { increment: 1 },
          dqrAccessConfirmed: input.dqrAccessConfirmed ?? false,
        },
      });
      await audit(
        tx,
        actorId,
        "PLATFORM_PAYMENT_TEST_CONFIGURATION_SAVED",
        null,
      );
    });
    return this.workspace();
  }

  async start(
    actorId: string,
    input: StartPlatformPaymentTestDto,
    storeId: string | null = null,
  ) {
    this.limit(`start:${actorId}`, 30);
    const test = await this.prisma.$transaction(async (tx) => {
      if (storeId) {
        const policy = await tx.$queryRaw<
          Array<{ enabled: boolean }>
        >`SELECT enabled FROM payment_gateway_policies WHERE provider = 'PHONEPE' FOR SHARE`;
        if (!policy[0]?.enabled)
          fail(
            "PAYMENT_GATEWAY_DISABLED",
            "PhonePe is not available for Store testing.",
          );
      }
      await lock(tx, storeId);
      if (
        storeId &&
        !(await tx.organization.findFirst({
          where: { id: storeId, status: "ACTIVE" },
          select: { id: true },
        }))
      )
        fail("STORE_INACTIVE", "An active Store is required for testing.");
      const old = await tx.platformPaymentTest.findUnique({
        where: {
          scopeKey_provider_createdById_keyDigest: {
            scopeKey: scopeKey(storeId),
            provider,
            createdById: actorId,
            keyDigest: digest(input.idempotencyKey),
          },
        },
      });
      if (old) return { row: old, created: false };
      if (process.env.SELFX_PHONEPE_UAT_ENABLED !== "true")
        fail(
          "PAYMENT_NOT_ENABLED",
          "PhonePe UAT execution is disabled on the API.",
        );
      paymentCallbackOrigin();
      const connection = storeId
        ? await tx.storePaymentConnection.findUnique({
            where: {
              organizationId_provider: { organizationId: storeId, provider },
            },
          })
        : await tx.platformPaymentTestConnection.findUnique({
            where: { provider },
          });
      if (
        !connection ||
        !connection.dqrAccessConfirmed ||
        connection.environment !== "UAT"
      )
        fail(
          "PAYMENT_ACCOUNT_UNCONFIRMED",
          "Save and confirm this account's UAT Dynamic QR access before testing.",
        );
      revision(connection.version, input.expectedVersion);
      const pending = await tx.platformPaymentTest.findFirst({
        where: {
          provider,
          scopeKey: scopeKey(storeId),
          connectionVersion: connection.version,
          OR: [
            { status: { in: activeStatuses } },
            {
              status: "FAILED",
              events: { some: { reportedStatus: "SUCCEEDED" } },
            },
          ],
        },
        select: { id: true },
      });
      if (pending)
        fail(
          "PAYMENT_TEST_PENDING",
          "An existing test is awaiting confirmation. Open it and check its status.",
        );
      const daily = await tx.platformPaymentTest.count({
        where: {
          provider,
          scopeKey: scopeKey(storeId),
          createdAt: { gte: new Date(Date.now() - 86400000) },
        },
      });
      if (daily >= 100)
        fail(
          "PAYMENT_TEST_LIMIT",
          "The daily account test limit has been reached.",
        );
      const id = createSelfxId(),
        now = new Date();
      const row = await tx.platformPaymentTest.create({
        data: {
          id,
          scopeKey: scopeKey(storeId),
          organizationId: storeId,
          provider,
          environment: "UAT",
          connectionVersion: connection.version,
          createdById: actorId,
          transactionId: `${storeId ? "ST" : "PT"}${id.replaceAll("-", "")}`,
          keyDigest: digest(input.idempotencyKey),
          status: "PREPARING",
          amountMinor: 100,
          currency: "INR",
          encryptedPayload: connection.encryptedPayload,
          initializationVector: connection.initializationVector,
          authenticationTag: connection.authenticationTag,
          keyVersion: connection.keyVersion,
          expiresAt: new Date(now.getTime() + 300000),
          leaseUntil: new Date(now.getTime() + 30000),
          nextCheckAt: new Date(now.getTime() + 30000),
        },
      });
      paymentTestAdapter(row).statusRequest(expected(row));
      await audit(tx, actorId, "PLATFORM_PAYMENT_TEST_STARTED", id, storeId);
      return { row, created: true };
    });
    if (test.created) {
      try {
        const adapter = paymentTestAdapter(test.row);
        const remaining = Math.floor(
          (test.row.expiresAt.getTime() - Date.now()) / 1000,
        );
        if (remaining < 1)
          throw new PaymentProviderError("LOCAL_REQUEST_INVALID");
        const response = await this.transport.send(
          adapter.createRequest(
            expected(test.row),
            storeId
              ? `${paymentCallbackOrigin()}/api/v1/payments/phonepe/stores/${storeId}/tests/${test.row.id}/callback`
              : `${paymentCallbackOrigin()}/api/v1/payments/phonepe/platform-tests/${test.row.id}/callback`,
            remaining,
          ),
        );
        const qr = adapter.parseQr(response, expected(test.row));
        await this.prisma.platformPaymentTest.updateMany({
          where: { id: test.row.id, status: { in: activeStatuses } },
          data: {
            status: "PENDING",
            qrString: qr.qrString,
            leaseUntil: null,
            nextCheckAt: new Date(Date.now() + 15000),
          },
        });
      } catch (error) {
        const diagnostic = paymentDiagnostic(error);
        this.logger.warn({
          event: "payment_test_diagnostic",
          testId: test.row.id,
          stage: "INITIALIZATION",
          ...diagnostic,
        });
        await this.prisma.platformPaymentTest.updateMany({
          where: { id: test.row.id, status: { in: activeStatuses } },
          data: {
            status: "UNKNOWN",
            failureCode: "PAYMENT_REQUEST_UNCERTAIN",
            initializationDiagnostic: diagnostic,
            leaseUntil: null,
            nextCheckAt: new Date(Date.now() + 15000),
          },
        });
      }
    }
    return this.detail(test.row.id, storeId);
  }

  async detail(id: string, storeId: string | null = null) {
    const row = await this.prisma.platformPaymentTest.findFirst({
      where: { id, scopeKey: scopeKey(storeId) },
      select: {
        ...summarySelect,
        qrString: true,
        initializationDiagnostic: true,
        statusDiagnostic: true,
      },
    });
    if (!row) notFound();
    return {
      ...summary(row),
      diagnostics: {
        initialization: readPaymentDiagnostic(row.initializationDiagnostic),
        status: readPaymentDiagnostic(row.statusDiagnostic),
      },
      qrString:
        row.status === "PENDING" && row.expiresAt > new Date()
          ? row.qrString
          : null,
      serverTime: new Date().toISOString(),
    };
  }

  async check(id: string, actorId: string, storeId: string | null = null) {
    this.limit(`check:${actorId}`, 60);
    await this.detail(id, storeId);
    await this.reconcile(id, actorId);
    return this.detail(id, storeId);
  }

  async callback(
    id: string,
    encoded: string,
    signature: string,
    ip: string,
    storeId: string | null = null,
  ) {
    this.limit(`callback:${ip}`, 1000);
    this.limit(`event:${id}`, 60);
    const row = await this.prisma.platformPaymentTest.findFirst({
      where: { id, scopeKey: scopeKey(storeId) },
    });
    if (!row) notFound();
    let evidence: ProviderPaymentStatus;
    try {
      if (signature.length > 128) throw new Error();
      evidence = paymentTestAdapter(row).verifyCallback(
        encoded,
        signature,
        expected(row),
      );
    } catch {
      throw new ApiErrorException(
        HttpStatus.UNAUTHORIZED,
        "PAYMENT_CALLBACK_INVALID",
        "Payment notification could not be verified.",
      );
    }
    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.platformPaymentTestEvent.createMany({
        skipDuplicates: true,
        data: [
          {
            id: createSelfxId(),
            testId: id,
            digest: digest(encoded),
            reportedStatus: evidence.status,
          },
        ],
      });
      if (inserted.count)
        await tx.platformPaymentTest.updateMany({
          where: { id, status: { not: "SUCCEEDED" } },
          data: { nextCheckAt: new Date() },
        });
    });
    return { accepted: true };
  }

  async reconcile(id: string, actorId: string | null = null) {
    const now = new Date();
    const claimed = await this.prisma.platformPaymentTest.updateMany({
      where: {
        id,
        status: { not: "SUCCEEDED" },
        AND: [
          { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
          { OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }] },
        ],
      },
      data: {
        leaseUntil: new Date(now.getTime() + 30000),
        nextCheckAt: new Date(now.getTime() + 30000),
      },
    });
    if (!claimed.count) return;
    const row = await this.prisma.platformPaymentTest.findUniqueOrThrow({
      where: { id },
    });
    let evidence: ProviderPaymentStatus | null = null;
    let diagnostic: ReturnType<typeof paymentDiagnostic> | null = null;
    try {
      evidence = paymentTestAdapter(row).parseStatus(
        await this.transport.send(
          paymentTestAdapter(row).statusRequest(expected(row)),
        ),
        expected(row),
      );
      if (evidence.status === "UNKNOWN")
        diagnostic = paymentDiagnostic(
          new PaymentProviderError("UNRECOGNIZED_STATUS"),
        );
    } catch (error) {
      diagnostic = paymentDiagnostic(error);
      this.logger.warn({
        event: "payment_test_diagnostic",
        testId: id,
        stage: "STATUS",
        ...diagnostic,
      });
      // Diagnostic evidence never changes an uncertain payment into a failure.
    }
    await this.prisma.$transaction(async (tx) => {
      await lock(tx, row.organizationId); // matches the account configuration lock
      await tx.$queryRaw`SELECT id FROM platform_payment_tests WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.platformPaymentTest.findUniqueOrThrow({
        where: { id },
      });
      if (current.status === "SUCCEEDED") return;
      const successEvent = await tx.platformPaymentTestEvent.findFirst({
        where: { testId: id, reportedStatus: "SUCCEEDED" },
        select: { id: true },
      });
      const terminal =
        evidence?.status === "SUCCEEDED" ||
        (evidence?.status === "FAILED" && !successEvent);
      if (terminal) {
        await tx.platformPaymentTest.update({
          where: { id },
          data: {
            status: evidence!.status,
            confirmedAt: evidence!.status === "SUCCEEDED" ? new Date() : null,
            checkedAt: new Date(),
            providerReference: evidence!.providerReference,
            failureCode:
              evidence!.status === "FAILED" ? "PAYMENT_FAILED" : null,
            statusDiagnostic: Prisma.DbNull,
            leaseUntil: null,
            nextCheckAt: null,
            checkCount: { increment: 1 },
          },
        });
        await audit(
          tx,
          actorId,
          evidence!.status === "SUCCEEDED"
            ? "PLATFORM_PAYMENT_TEST_PASSED"
            : "PLATFORM_PAYMENT_TEST_FAILED",
          id,
          row.organizationId,
        );
      } else {
        const failed = current.status === "FAILED";
        const delay = Math.min(
          3600000,
          15000 * 2 ** Math.min(current.checkCount, 8),
        );
        await tx.platformPaymentTest.update({
          where: { id },
          data: {
            status: failed
              ? "FAILED"
              : evidence?.status === "PENDING" && !successEvent
                ? "PENDING"
                : "UNKNOWN",
            checkedAt: new Date(),
            statusDiagnostic: diagnostic ?? Prisma.DbNull,
            leaseUntil: null,
            nextCheckAt:
              failed && !successEvent ? null : new Date(Date.now() + delay),
            failureCode: successEvent
              ? "PAYMENT_EVIDENCE_CONFLICT"
              : !evidence
                ? "PAYMENT_STATUS_UNAVAILABLE"
                : evidence.status === "PENDING"
                  ? null
                  : "PAYMENT_STATUS_UNRESOLVED",
            checkCount: { increment: 1 },
          },
        });
      }
    });
  }

  async reconcileDue() {
    const now = new Date();
    const rows = await this.prisma.platformPaymentTest.findMany({
      where: {
        status: { not: "SUCCEEDED" },
        nextCheckAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      select: { id: true },
      orderBy: [{ nextCheckAt: "asc" }, { id: "asc" }],
      take: 20,
    });
    for (let i = 0; i < rows.length; i += 4)
      await Promise.allSettled(
        rows.slice(i, i + 4).map((row) => this.reconcile(row.id)),
      );
    return rows.length;
  }

  private async connection(
    tx: Prisma.TransactionClient,
    storeId: string | null,
  ) {
    const select = {
      provider: true,
      environment: true,
      version: true,
      dqrAccessConfirmed: true,
      updatedAt: true,
    };
    return storeId
      ? tx.storePaymentConnection.findUnique({
          where: {
            organizationId_provider: { organizationId: storeId, provider },
          },
          select,
        })
      : tx.platformPaymentTestConnection.findUnique({
          where: { provider },
          select,
        });
  }

  private limit(key: string, maximum: number) {
    const now = Date.now(),
      old = this.buckets.get(key);
    if (!old || old.reset <= now) {
      if (this.buckets.size >= 10000)
        this.buckets.delete(this.buckets.keys().next().value!);
      this.buckets.set(key, { count: 1, reset: now + 60000 });
      return;
    }
    if (++old.count > maximum)
      throw new ApiErrorException(
        HttpStatus.TOO_MANY_REQUESTS,
        "PAYMENT_RATE_LIMIT",
        "Too many payment requests. Try again shortly.",
      );
  }
}

type TestSnapshot = {
  encryptedPayload: string;
  initializationVector: string;
  authenticationTag: string;
  keyVersion: string;
  provider: string;
  environment: string;
  organizationId?: string | null;
  scopeKey?: string;
};
function paymentTestAdapter(row: TestSnapshot) {
  if (!row.organizationId) return platformTestAdapter(row);
  const snapshot = decryptPaymentSnapshot<
    PhonePeDqrCredentials & {
      organizationId: string;
      provider: string;
      scope?: string;
    }
  >(row);
  if (
    snapshot.scope ||
    snapshot.organizationId?.toLowerCase() !==
      row.organizationId.toLowerCase() ||
    snapshot.provider !== row.provider ||
    snapshot.environment !== row.environment ||
    row.environment !== "UAT" ||
    row.scopeKey !== scopeKey(row.organizationId)
  )
    throw new Error("Store test snapshot mismatch.");
  return new PhonePeDqrAdapter(snapshot);
}

export function platformTestAdapter(row: {
  encryptedPayload: string;
  initializationVector: string;
  authenticationTag: string;
  keyVersion: string;
  provider: string;
  environment: string;
  organizationId?: string | null;
  scopeKey?: string;
}) {
  const snapshot = decryptPaymentSnapshot<
    PhonePeDqrCredentials & { scope: string; provider: string }
  >(row);
  if (
    !!row.organizationId ||
    (row.scopeKey !== undefined && row.scopeKey !== "PLATFORM_TEST") ||
    snapshot.scope !== "PLATFORM_TEST" ||
    snapshot.provider !== row.provider ||
    snapshot.environment !== row.environment ||
    row.environment !== "UAT"
  )
    throw new Error("Platform test snapshot mismatch.");
  return new PhonePeDqrAdapter(snapshot);
}
function summary(row: Summary) {
  const {
    _count,
    events,
    createdAt,
    expiresAt,
    confirmedAt,
    checkedAt,
    nextCheckAt,
    // Additional database fields must never be spread into API summaries.
  } = row;
  return {
    id: row.id,
    provider: row.provider,
    environment: row.environment,
    connectionVersion: row.connectionVersion,
    status: row.status,
    amountMinor: row.amountMinor,
    currency: row.currency,
    failureCode: row.failureCode,
    providerReference: row.providerReference,
    createdAt: createdAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
    confirmedAt: confirmedAt?.toISOString() ?? null,
    checkedAt: checkedAt?.toISOString() ?? null,
    nextCheckAt: nextCheckAt?.toISOString() ?? null,
    callbackReceived: _count.events > 0,
    verificationPending: row.status !== "SUCCEEDED" && events.length > 0,
    testOnly: true as const,
  };
}
function expected(row: PlatformPaymentTest) {
  return {
    transactionId: row.transactionId,
    amountMinor: row.amountMinor,
    currency: "INR" as const,
  };
}
function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
function scopeKey(storeId: string | null) {
  return storeId ? `STORE:${storeId.toLowerCase()}` : "PLATFORM_TEST";
}
async function lock(
  tx: Prisma.TransactionClient,
  storeId: string | null = null,
) {
  if (storeId)
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${storeId}::uuid FOR UPDATE`;
  else
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended('platform-payment-test:PHONEPE', 0))::text`;
}
function revision(actual: number, wanted: number) {
  if (actual !== wanted)
    fail(
      "PAYMENT_SETTINGS_CHANGED",
      "Test configuration changed. Reload before continuing.",
    );
}
function fail(code: string, message: string): never {
  throw new ApiErrorException(HttpStatus.CONFLICT, code, message);
}
function notFound(): never {
  throw new ApiErrorException(
    HttpStatus.NOT_FOUND,
    "PAYMENT_TEST_NOT_FOUND",
    "Payment test was not found.",
  );
}
async function audit(
  tx: Prisma.TransactionClient,
  actorUserId: string | null,
  action: string,
  id: string | null,
  storeId: string | null = null,
) {
  await tx.auditLog.create({
    data: {
      id: createSelfxId(),
      actorUserId,
      organizationId: storeId,
      resourceType: storeId ? "store_payment_test" : "platform_payment_test",
      resourceId: id,
      action: storeId ? action.replace("PLATFORM_", "STORE_") : action,
      metadata: { provider, environment: "UAT" },
    },
  });
}
