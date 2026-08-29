import { KioskAssignmentScope, TryOnAssetPurpose } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { ApiErrorException } from "../common/api-error.exception.js";
import type { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import type { PublicApiCredentialContext } from "./public-api-key-auth.service.js";
import { PublicApiTryOnService } from "./public-api-try-on.service.js";

describe("PublicApiTryOnService", () => {
  it("creates an idempotent public API Try-On run for Store-scoped assets", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const sessions = new FakeTryOnSessions();
    const storage = new FakeStorage();
    const webhooks = new FakeWebhooks();
    const service = new PublicApiTryOnService(
      prisma as never,
      execution as never,
      sessions as never,
      storage as never,
      webhooks as never,
      new FakeUsageEvents() as never,
    );

    const created = await service.createRun(credential(), createInput());
    await flushPromises();

    expect(created).toMatchObject({
      status: "QUEUED",
      sessionId: "0198a9b3-d0bc-7000-8000-000000000001",
      personAssetId: "person-asset",
      garmentAssetId: "garment-asset",
    });
    expect(prisma.createdRuns[0]).toMatchObject({
      kioskDeviceId: null,
      apiKeyId: "api-key-1",
      clientRequestId: "request-1",
      assignmentScope: KioskAssignmentScope.ORGANIZATION,
      organizationId: "store-1",
      storeId: null,
      garmentSource: "PUBLIC_API",
      garmentIntent: "TOP",
      garmentCategory: "TOP",
      garmentPhotoType: "FLAT_LAY",
    });
    expect(sessions.getSessionAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "0198a9b3-d0bc-7000-8000-000000000001",
        organizationId: "store-1",
        storeId: null,
        kioskDeviceId: null,
        purpose: TryOnAssetPurpose.PERSON,
      }),
    );
    expect(sessions.getSessionAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "store-1",
        purpose: TryOnAssetPurpose.GARMENT,
      }),
    );
    expect(execution.submissions).toBe(1);
    expect(sessions.recordLook).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "0198a9b3-d0bc-7000-8000-000000000001",
        organizationId: "store-1",
        storeId: null,
        kioskDeviceId: null,
        kioskTryOnRunId: expect.any(String),
        personAssetId: "person-asset",
        garmentAssetId: "garment-asset",
      }),
    );
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringMatching(
          /^public-api\/0198a9b3-d0bc-7000-8000-000000000001\/results\/[\w-]+\.png$/,
        ),
        contentType: "image/png",
      }),
    );
    expect(webhooks.deliverTryOnRunTerminalEvent).toHaveBeenCalledWith(
      "store-1",
      expect.objectContaining({
        id: created.id,
        status: "COMPLETED",
        sessionId: "0198a9b3-d0bc-7000-8000-000000000001",
      }),
    );
  });

  it("returns an existing run for the same API key and client request ID", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const service = new PublicApiTryOnService(
      prisma as never,
      execution as never,
      new FakeTryOnSessions() as never,
      new FakeStorage() as never,
      new FakeWebhooks() as never,
      new FakeUsageEvents() as never,
    );

    const first = await service.createRun(credential(), createInput());
    const second = await service.createRun(credential(), createInput());
    await flushPromises();

    expect(second.id).toBe(first.id);
    expect(prisma.createdRuns).toHaveLength(1);
    expect(execution.submissions).toBe(1);
  });

  it("returns Store-scoped public status with a tracked download URL", async () => {
    const prisma = new FakePrisma();
    const service = new PublicApiTryOnService(
      prisma as never,
      new FakeExecution() as never,
      new FakeTryOnSessions() as never,
      new FakeStorage() as never,
      new FakeWebhooks() as never,
      new FakeUsageEvents() as never,
    );
    prisma.seedRun({
      id: "0198a9b3-d0bc-7000-8000-000000000099",
      apiKeyId: "api-key-2",
      status: "COMPLETED",
      resultAsset: {
        id: "result-asset",
        storageKey: "public-api/session/results/run.png",
        contentType: "image/png",
        sizeBytes: 24,
        width: 320,
        height: 480,
        expiresAt: new Date("2026-09-04T00:00:00.000Z"),
      },
    });

    const response = await service.getRun(
      credential({ apiKeyId: "api-key-reader", scopes: ["tryon:read"] }),
      "0198a9b3-d0bc-7000-8000-000000000099",
    );

    expect(response).toMatchObject({
      id: "0198a9b3-d0bc-7000-8000-000000000099",
      status: "COMPLETED",
      result: {
        assetId: "result-asset",
      },
    });
    expect(response.result?.readUrl).toContain(
      "/api/v1/public/try-ons/0198a9b3-d0bc-7000-8000-000000000099/download",
    );
  });

  it("downloads a completed result through SelfX and records Public API usage", async () => {
    const prisma = new FakePrisma();
    const storage = new FakeStorage();
    const usageEvents = new FakeUsageEvents();
    const service = new PublicApiTryOnService(
      prisma as never,
      new FakeExecution() as never,
      new FakeTryOnSessions() as never,
      storage as never,
      new FakeWebhooks() as never,
      usageEvents as never,
    );
    prisma.seedRun({
      id: "0198a9b3-d0bc-7000-8000-000000000099",
      apiKeyId: "api-key-2",
      status: "COMPLETED",
      resultAsset: {
        id: "result-asset",
        storageKey: "public-api/session/results/run.png",
        contentType: "image/png",
        sizeBytes: 24,
        width: 320,
        height: 480,
        expiresAt: new Date("2026-09-04T00:00:00.000Z"),
      },
      look: { id: "look-1" },
    });

    const download = await service.downloadRunResult(
      credential({ apiKeyId: "api-key-reader", scopes: ["tryon:read"] }),
      "0198a9b3-d0bc-7000-8000-000000000099",
    );

    expect(download).toMatchObject({
      body: pngBuffer(),
      contentType: "image/png",
      contentLength: 24,
    });
    expect(download.contentDisposition).toContain("attachment;");
    expect(storage.readObject).toHaveBeenCalledWith(
      "public-api/session/results/run.png",
      expect.any(Number),
    );
    expect(usageEvents.recordPublicApiEvent).toHaveBeenCalledWith({
      eventName: "PUBLIC_API_DOWNLOAD_COMPLETED",
      idempotencyKey:
        "public-api-result-downloaded:api-key-reader:0198a9b3-d0bc-7000-8000-000000000099",
      apiKeyId: "api-key-reader",
      organizationId: "store-1",
      tryOnSessionId: "0198a9b3-d0bc-7000-8000-000000000001",
      kioskTryOnRunId: "0198a9b3-d0bc-7000-8000-000000000099",
      tryOnLookId: "look-1",
      productId: null,
      provider: "fake-provider",
      providerModel: "fake-model-v1",
      status: "COMPLETED",
      metadata: {
        result_asset_id: "result-asset",
      },
    });
  });

  it("does not allow one Store API key to read another Store public run", async () => {
    const prisma = new FakePrisma();
    const service = new PublicApiTryOnService(
      prisma as never,
      new FakeExecution() as never,
      new FakeTryOnSessions() as never,
      new FakeStorage() as never,
      new FakeWebhooks() as never,
      new FakeUsageEvents() as never,
    );
    prisma.seedRun({
      id: "0198a9b3-d0bc-7000-8000-000000000099",
      organizationId: "store-2",
      apiKeyId: "api-key-2",
    });

    await expect(
      service.getRun(
        credential({ scopes: ["tryon:read"] }),
        "0198a9b3-d0bc-7000-8000-000000000099",
      ),
    ).rejects.toBeInstanceOf(ApiErrorException);
  });
});

class FakeExecution implements Pick<
  TryOnExecutionService,
  "assertConfigured" | "metadata" | "process"
> {
  submissions = 0;

  assertConfigured(): void {
    return undefined;
  }

  metadata() {
    return {
      provider: "fake-provider",
      providerDisplayName: "Fake Provider",
      model: "fake-model-v1",
    };
  }

  async process(
    _payload: Parameters<TryOnExecutionService["process"]>[0],
    observer: Parameters<TryOnExecutionService["process"]>[1],
  ): Promise<void> {
    this.submissions += 1;
    await observer.onStarted(new Date("2026-08-29T00:00:00.000Z"));
    await observer.onSubmitted(`provider-${this.submissions}`);
    await observer.onStatus({
      status: "COMPLETED",
      resultImage: `data:image/png;base64,${pngBuffer().toString("base64")}`,
      completedAt: new Date("2026-08-29T00:00:02.000Z"),
    });
  }
}

class FakeTryOnSessions {
  readonly getCurrentPersonAsset = vi.fn(async () => personAsset());
  readonly getSessionAsset = vi.fn(
    async ({ purpose }: { purpose: TryOnAssetPurpose }) =>
      purpose === TryOnAssetPurpose.PERSON ? personAsset() : garmentAsset(),
  );
  readonly recordLook = vi.fn(async () => undefined);
}

class FakeStorage {
  readonly putObject = vi.fn(async () => undefined);
  readonly deleteObject = vi.fn(async () => undefined);
  readonly readObject = vi.fn(async () => pngBuffer());
  readonly createReadUrl = vi.fn((input: { key: string }) => {
    return `https://storage.selfx.test/${input.key}`;
  });
}

class FakeWebhooks {
  readonly deliverTryOnRunTerminalEvent = vi.fn(async () => undefined);
}

class FakeUsageEvents {
  readonly recordPublicApiEvent = vi.fn(async () => undefined);
}

class FakePrisma {
  private readonly runs = new Map<string, FakeRun>();
  readonly createdRuns: FakeRun[] = [];

  readonly kioskTryOnRun = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    findUnique: vi.fn(async ({ where }: { where: FindUniqueWhere }) => {
      const key = runKey(
        where.apiKeyId_clientRequestId.apiKeyId,
        where.apiKeyId_clientRequestId.clientRequestId,
      );
      return this.runs.get(key) ?? null;
    }),
    findFirst: vi.fn(async ({ where }: { where: FindFirstWhere }) => {
      return (
        [...this.runs.values()].find(
          (run) =>
            run.id === where.id &&
            (where.assignmentScope === undefined ||
              run.assignmentScope === where.assignmentScope) &&
            run.organizationId === where.organizationId &&
            run.apiKeyId !== null &&
            (where.status === undefined || run.status === where.status) &&
            (where.resultAsset === undefined || run.resultAsset !== null),
        ) ?? null
      );
    }),
    create: vi.fn(async ({ data }: { data: CreateRunData }) => {
      const now = new Date();
      const run: FakeRun = {
        ...data,
        providerPredictionId: null,
        resultImage: null,
        resultAssetId: null,
        resultAsset: null,
        look: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        submittedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.runs.set(runKey(run.apiKeyId, run.clientRequestId), run);
      this.createdRuns.push(run);
      return run;
    }),
    update: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<FakeRun>;
      }) => {
        const run = [...this.runs.values()].find(
          (item) => item.id === where.id,
        );
        if (!run) {
          throw new Error("run not found");
        }
        Object.assign(run, data, { updatedAt: new Date() });
        return run;
      },
    ),
  };

  seedRun(input: Partial<FakeRun> & { id: string; apiKeyId: string }): void {
    const now = new Date();
    const run: FakeRun = {
      id: input.id,
      kioskDeviceId: null,
      apiKeyId: input.apiKeyId,
      tryOnSessionId: "0198a9b3-d0bc-7000-8000-000000000001",
      clientRequestId: input.clientRequestId ?? "request-seeded",
      status: input.status ?? "QUEUED",
      assignmentScope: KioskAssignmentScope.ORGANIZATION,
      organizationId: input.organizationId ?? "store-1",
      storeId: null,
      personAssetId: "person-asset",
      garmentAssetId: "garment-asset",
      productId: null,
      resultAssetId: input.resultAsset?.id ?? null,
      resultAsset: input.resultAsset ?? null,
      look: input.look ?? null,
      provider: "fake-provider",
      providerDisplayName: "Fake Provider",
      providerModel: "fake-model-v1",
      providerPredictionId: null,
      garmentSource: "PUBLIC_API",
      garmentIntent: "AUTO",
      garmentCategory: "AUTO",
      garmentPhotoType: "AUTO",
      generationProfile: "BALANCED",
      resultImage: null,
      errorCode: null,
      errorMessage: null,
      startedAt: null,
      submittedAt: null,
      completedAt: null,
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    };
    this.runs.set(runKey(run.apiKeyId, run.clientRequestId), run);
  }
}

interface FindUniqueWhere {
  apiKeyId_clientRequestId: {
    apiKeyId: string;
    clientRequestId: string;
  };
}

interface FindFirstWhere {
  id: string;
  assignmentScope?: KioskAssignmentScope;
  organizationId: string;
  apiKeyId: { not: null };
  status?: string;
  resultAsset?: unknown;
}

interface CreateRunData {
  id: string;
  kioskDeviceId: string | null;
  apiKeyId: string;
  tryOnSessionId: string;
  clientRequestId: string;
  status: string;
  assignmentScope: KioskAssignmentScope;
  organizationId: string;
  storeId: string | null;
  personAssetId: string;
  garmentAssetId: string;
  productId: string | null;
  provider: string;
  providerDisplayName: string;
  providerModel: string;
  garmentSource: string;
  garmentIntent: string;
  garmentCategory: string;
  garmentPhotoType: string;
  generationProfile: string;
  expiresAt: Date;
}

type FakeRun = CreateRunData & {
  providerPredictionId: string | null;
  resultImage: string | null;
  resultAssetId: string | null;
  resultAsset: FakeResultAsset | null;
  look: { id: string } | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

interface FakeResultAsset {
  id: string;
  storageKey: string;
  contentType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  expiresAt: Date;
}

function credential(
  overrides: Partial<PublicApiCredentialContext> = {},
): PublicApiCredentialContext {
  return {
    ...baseCredential(),
    ...overrides,
  };
}

function baseCredential(): PublicApiCredentialContext {
  return {
    apiKeyId: "api-key-1",
    keyPrefix: "selfx_test_abcdefghijkl",
    storeId: "store-1",
    storeName: "Store One",
    environment: "TEST" as const,
    scopes: ["tryon:create" as const],
  };
}

function createInput() {
  return {
    clientRequestId: "request-1",
    sessionId: "0198a9b3-d0bc-7000-8000-000000000001",
    personAssetId: "person-asset",
    garmentAssetId: "garment-asset",
    garmentIntent: "TOP" as const,
    category: "TOP" as const,
    garmentPhotoType: "FLAT_LAY" as const,
    generationProfile: "BALANCED" as const,
  };
}

function personAsset() {
  return {
    id: "person-asset",
    purpose: TryOnAssetPurpose.PERSON,
    storageKey: "public-api/store-1/session/person.png",
    contentType: "image/png",
  };
}

function garmentAsset() {
  return {
    id: "garment-asset",
    purpose: TryOnAssetPurpose.GARMENT,
    storageKey: "public-api/store-1/session/garment.png",
    contentType: "image/png",
  };
}

function runKey(apiKeyId: string, clientRequestId: string): string {
  return `${apiKeyId}:${clientRequestId}`;
}

function pngBuffer(): Buffer {
  const buffer = Buffer.alloc(24);
  buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  buffer.write("IHDR", 12, "ascii");
  buffer.writeUInt32BE(320, 16);
  buffer.writeUInt32BE(480, 20);
  return buffer;
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
