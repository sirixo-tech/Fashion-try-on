import { KioskAssignmentScope } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { normalizeSelfxGarmentCategory } from "../catalog/garment-category-normalization.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { KioskTryOnService } from "./kiosk-try-on.service.js";
import type { CreateKioskTryOnRunPayload } from "./kiosk-try-on.multipart.js";
import type { JewelleryTryOnExecutionService } from "../try-on/jewellery/jewellery-try-on-execution.service.js";
import type { JewelleryTryOnService } from "../try-on/jewellery/jewellery-try-on.service.js";
import type { TryOnExecutionService } from "../try-on/try-on-execution.service.js";

describe("KIOSK-4B production Try-On service", () => {
  it("creates a PLATFORM kiosk run while TRYON_LAB_ENABLED is false", async () => {
    const restore = setLabEnabled(false);
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const service = new KioskTryOnService(prisma as never, execution as never);

    const created = await service.createRun(
      platformDevice("device-1"),
      payload(),
    );
    await flushPromises();

    expect(created.status).toBe("QUEUED");
    expect(prisma.createdRuns[0]).toMatchObject({
      kioskDeviceId: "device-1",
      clientRequestId: "attempt-1",
      assignmentScope: KioskAssignmentScope.PLATFORM,
      organizationId: null,
      storeId: null,
    });
    expect(execution.submissions).toBe(1);
    restore();
  });

  it("records store catalog reference metadata for Store-owned kiosk runs", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const service = new KioskTryOnService(prisma as never, execution as never);

    await service.createRun(
      storeDevice("device-1", "store-1"),
      payload({
        productId: "0198a9b3-d0bc-7000-8000-000000000701",
        catalogSource: "SHOPIFY",
        externalProductId: "shopify-product-1",
        externalVariantId: "variant-blue-xl",
        sku: "LINEN-BLUE-XL",
        productName: "Blue Linen Shirt",
        price: "2499.00",
        currency: "inr",
      }),
    );

    expect(prisma.createdRuns[0]).toMatchObject({
      assignmentScope: KioskAssignmentScope.ORGANIZATION,
      organizationId: "store-1",
      storeId: null,
      productId: "0198a9b3-d0bc-7000-8000-000000000701",
      catalogSource: "SHOPIFY",
      externalProductId: "shopify-product-1",
      externalVariantId: "variant-blue-xl",
      externalSku: "LINEN-BLUE-XL",
      externalProductName: "Blue Linen Shirt",
      externalProductPrice: "2499.00",
      externalCurrency: "INR",
    });
  });

  it("returns the existing run for the same device and clientRequestId", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const service = new KioskTryOnService(prisma as never, execution as never);

    const first = await service.createRun(
      platformDevice("device-1"),
      payload(),
    );
    const second = await service.createRun(
      platformDevice("device-1"),
      payload(),
    );
    await flushPromises();

    expect(second.id).toBe(first.id);
    expect(execution.submissions).toBe(1);
    expect(prisma.createdRuns).toHaveLength(1);
  });

  it("creates a Store jewellery run through the jewellery provider path", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const jewelleryTryOn = new FakeJewelleryTryOnService();
    const jewelleryExecution = new FakeJewelleryExecution();
    const service = new KioskTryOnService(
      prisma as never,
      execution as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      jewelleryTryOn as never,
      jewelleryExecution as never,
    );

    const created = await service.createRun(
      storeDevice("device-1", "store-1"),
      jewelleryPayload(),
    );
    await flushPromises();

    expect(created).toMatchObject({
      status: "QUEUED",
      tryOnVertical: "JEWELLERY",
      jewelleryType: "RING",
    });
    expect(jewelleryTryOn.preparedStoreIds).toEqual(["store-1"]);
    expect(jewelleryExecution.submissions).toBe(1);
    expect(execution.submissions).toBe(0);
    expect(prisma.createdRuns[0]).toMatchObject({
      kioskDeviceId: "device-1",
      assignmentScope: KioskAssignmentScope.ORGANIZATION,
      organizationId: "store-1",
      tryOnVertical: "JEWELLERY",
      jewelleryType: "RING",
      garmentSource: "DIRECT_UPLOAD",
      garmentIntent: "JEWELLERY",
      garmentCategory: "RING",
      garmentPhotoType: "PRODUCT",
      provider: "perfect-corp",
    });
  });

  it("rejects jewellery Try-On for platform-only kiosks", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const jewelleryTryOn = new FakeJewelleryTryOnService();
    const jewelleryExecution = new FakeJewelleryExecution();
    const service = new KioskTryOnService(
      prisma as never,
      execution as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      jewelleryTryOn as never,
      jewelleryExecution as never,
    );

    await expect(
      service.createRun(platformDevice("device-1"), jewelleryPayload()),
    ).rejects.toBeInstanceOf(ApiErrorException);

    expect(jewelleryTryOn.preparedStoreIds).toEqual([]);
    expect(jewelleryExecution.submissions).toBe(0);
    expect(prisma.createdRuns).toHaveLength(0);
  });

  it("does not allow one kiosk device to read another device run", async () => {
    const prisma = new FakePrisma();
    const service = new KioskTryOnService(
      prisma as never,
      new FakeExecution() as never,
    );

    const created = await service.createRun(
      platformDevice("device-1"),
      payload(),
    );

    await expect(
      service.getRun(platformDevice("device-2"), created.id),
    ).rejects.toBeInstanceOf(ApiErrorException);
  });

  it("refuses known incompatible model coverage before provider submission", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const service = new KioskTryOnService(prisma as never, execution as never);

    let thrown: unknown;
    try {
      await service.createRun(
        platformDevice("device-1"),
        payload({
          garmentIntent: "BOTTOM",
          category: "BOTTOM",
          modelCoverage: "UPPER_BODY",
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiErrorException);
    expect((thrown as ApiErrorException).getResponse()).toMatchObject({
      error: {
        code: "MODEL_IMAGE_INCOMPATIBLE_WITH_GARMENT",
      },
    });

    expect(execution.submissions).toBe(0);
    expect(prisma.createdRuns).toHaveLength(0);
  });

  it("allows automatic direct-upload garment category for full-body model coverage", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const service = new KioskTryOnService(prisma as never, execution as never);

    const created = await service.createRun(
      platformDevice("device-1"),
      payload({
        garmentIntent: "AUTO",
        category: "AUTO",
        modelCoverage: "FULL_BODY",
      }),
    );
    await flushPromises();

    expect(created.status).toBe("QUEUED");
    expect(execution.submissions).toBe(1);
    expect(prisma.createdRuns[0]).toMatchObject({
      garmentIntent: "AUTO",
      garmentCategory: "AUTO",
    });
  });

  it("allows automatic direct-upload garment category for partial model coverage", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const service = new KioskTryOnService(prisma as never, execution as never);

    const created = await service.createRun(
      platformDevice("device-1"),
      payload({
        garmentIntent: "AUTO",
        category: "AUTO",
        modelCoverage: "UPPER_BODY",
      }),
    );
    await flushPromises();

    expect(created.status).toBe("QUEUED");
    expect(execution.submissions).toBe(1);
    expect(prisma.createdRuns[0]).toMatchObject({
      garmentIntent: "AUTO",
      garmentCategory: "AUTO",
    });
  });

  it("keeps UNKNOWN model coverage fail-safe before provider submission", async () => {
    const prisma = new FakePrisma();
    const execution = new FakeExecution();
    const service = new KioskTryOnService(prisma as never, execution as never);

    let thrown: unknown;
    try {
      await service.createRun(
        platformDevice("device-1"),
        payload({
          garmentIntent: "AUTO",
          category: "AUTO",
          modelCoverage: "UNKNOWN",
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApiErrorException);
    expect((thrown as ApiErrorException).getResponse()).toMatchObject({
      error: {
        code: "MODEL_IMAGE_INCOMPATIBLE_WITH_GARMENT",
      },
    });
    expect(execution.submissions).toBe(0);
    expect(prisma.createdRuns).toHaveLength(0);
  });

  it("normalizes plural catalog garment categories to Try-On categories", () => {
    expect(normalizeSelfxGarmentCategory("TOPS")).toBe("TOP");
    expect(normalizeSelfxGarmentCategory("bottoms")).toBe("BOTTOM");
    expect(normalizeSelfxGarmentCategory("dresses")).toBe("ONE_PIECE");
  });
});

function payload(
  overrides: Partial<CreateKioskTryOnRunPayload> = {},
): CreateKioskTryOnRunPayload {
  return {
    clientRequestId: "attempt-1",
    tryOnVertical: "GARMENT",
    personImage: uploadedImage("personImage"),
    garmentImage: uploadedImage("garmentImage"),
    garmentSource: "DIRECT_UPLOAD",
    garmentIntent: "TOP",
    category: "TOP",
    garmentPhotoType: "FLAT_LAY",
    generationProfile: "BALANCED",
    categoryResolutionSource: "BODY_COVERAGE_ANALYSIS",
    photoTypeResolutionSource: "AUTO_FALLBACK",
    profileResolutionSource: "PLATFORM_DEFAULT",
    disambiguationRequired: false,
    disambiguationResolved: false,
    garmentAnalysisReasonCodes: [],
    qualityWarningCodes: [],
    qualityOverrideAccepted: false,
    ...overrides,
  };
}

function jewelleryPayload(
  overrides: Partial<CreateKioskTryOnRunPayload> = {},
): CreateKioskTryOnRunPayload {
  return {
    clientRequestId: "attempt-1",
    tryOnVertical: "JEWELLERY",
    personImage: uploadedImage("personImage"),
    jewelleryImage: uploadedImage("jewelleryImage"),
    jewelleryType: "RING",
    garmentSource: "DIRECT_UPLOAD",
    garmentIntent: "JEWELLERY" as never,
    category: "AUTO",
    garmentPhotoType: "PRODUCT" as never,
    generationProfile: "BALANCED",
    categoryResolutionSource: "SELFX_CATALOG_METADATA",
    photoTypeResolutionSource: "SELFX_CATALOG_METADATA",
    profileResolutionSource: "PLATFORM_DEFAULT",
    disambiguationRequired: false,
    disambiguationResolved: true,
    garmentAnalysisReasonCodes: [],
    qualityWarningCodes: [],
    qualityOverrideAccepted: false,
    ...overrides,
  };
}

function uploadedImage<
  TFieldName extends "personImage" | "garmentImage" | "jewelleryImage",
>(fieldName: TFieldName) {
  return {
    fieldName,
    filename: `${fieldName}.jpg`,
    mimeType: "image/jpeg" as const,
    sizeBytes: 128,
    buffer: Buffer.from("image"),
    dataUri: "data:image/jpeg;base64,aW1hZ2U=",
    width: 128,
    height: 128,
  };
}

function platformDevice(id: string) {
  return {
    id,
    assignmentScope: KioskAssignmentScope.PLATFORM,
    organizationId: null,
    storeId: null,
  };
}

function storeDevice(id: string, organizationId: string) {
  return {
    id,
    assignmentScope: KioskAssignmentScope.ORGANIZATION,
    organizationId,
    storeId: null,
  };
}

function setLabEnabled(enabled: boolean): () => void {
  const previous = process.env.TRYON_LAB_ENABLED;
  process.env.TRYON_LAB_ENABLED = enabled ? "true" : "false";
  return () => {
    if (previous === undefined) {
      delete process.env.TRYON_LAB_ENABLED;
    } else {
      process.env.TRYON_LAB_ENABLED = previous;
    }
  };
}

async function flushPromises(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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
    await observer.onStarted(new Date());
    await observer.onSubmitted(`provider-${this.submissions}`);
  }
}

class FakeJewelleryTryOnService implements Pick<
  JewelleryTryOnService,
  "prepareRunFoundation"
> {
  readonly preparedStoreIds: string[] = [];

  async prepareRunFoundation(
    input: Parameters<JewelleryTryOnService["prepareRunFoundation"]>[0],
  ): Promise<
    Awaited<ReturnType<JewelleryTryOnService["prepareRunFoundation"]>>
  > {
    this.preparedStoreIds.push(input.storeId);
    return {
      vertical: "JEWELLERY",
      jewelleryType: input.jewelleryType,
      provider: {
        provider: "perfect-corp",
        providerDisplayName: "Perfect Corp",
        model: "perfect-corp-jewellery-v1",
      },
      productReference: input.productReference,
    };
  }
}

class FakeJewelleryExecution implements Pick<
  JewelleryTryOnExecutionService,
  "metadata" | "assertConfigured" | "process"
> {
  submissions = 0;

  assertConfigured(): void {
    return undefined;
  }

  metadata() {
    return {
      provider: "perfect-corp" as const,
      providerDisplayName: "Perfect Corp",
      model: "perfect-corp-jewellery-v1",
    };
  }

  async process(
    _payload: Parameters<JewelleryTryOnExecutionService["process"]>[0],
    observer: Parameters<JewelleryTryOnExecutionService["process"]>[1],
  ): Promise<void> {
    this.submissions += 1;
    await observer.onStarted(new Date());
    await observer.onSubmitted(`jewellery-provider-${this.submissions}`);
  }
}

class FakePrisma {
  private readonly runs = new Map<string, FakeRun>();
  readonly createdRuns: FakeRun[] = [];

  readonly kioskTryOnRun = {
    deleteMany: vi.fn(async () => ({ count: 0 })),
    findUnique: vi.fn(async ({ where }: { where: FindUniqueWhere }) => {
      const key = runKey(
        where.kioskDeviceId_clientRequestId.kioskDeviceId,
        where.kioskDeviceId_clientRequestId.clientRequestId,
      );
      return this.runs.get(key) ?? null;
    }),
    findFirst: vi.fn(async ({ where }: { where: FindFirstWhere }) => {
      return (
        [...this.runs.values()].find(
          (run) =>
            run.id === where.id && run.kioskDeviceId === where.kioskDeviceId,
        ) ?? null
      );
    }),
    create: vi.fn(async ({ data }: { data: CreateRunData }) => {
      const now = new Date();
      const run: FakeRun = {
        ...data,
        providerPredictionId: null,
        resultImage: null,
        errorCode: null,
        errorMessage: null,
        startedAt: null,
        submittedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.runs.set(runKey(run.kioskDeviceId, run.clientRequestId), run);
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
}

interface FindUniqueWhere {
  kioskDeviceId_clientRequestId: {
    kioskDeviceId: string;
    clientRequestId: string;
  };
}

interface FindFirstWhere {
  id: string;
  kioskDeviceId: string;
}

interface CreateRunData {
  id: string;
  kioskDeviceId: string;
  clientRequestId: string;
  status: string;
  assignmentScope: KioskAssignmentScope;
  organizationId: string | null;
  storeId: string | null;
  personAssetId?: string;
  garmentAssetId?: string;
  productId?: string | null;
  catalogSource?: string | null;
  externalProductId?: string | null;
  externalVariantId?: string | null;
  externalSku?: string | null;
  externalProductName?: string | null;
  externalProductPrice?: string | null;
  externalCurrency?: string | null;
  provider: string;
  providerDisplayName: string;
  providerModel: string;
  tryOnVertical: string;
  jewelleryType?: string | null;
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
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  submittedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function runKey(kioskDeviceId: string, clientRequestId: string): string {
  return `${kioskDeviceId}:${clientRequestId}`;
}
