import { createHash, randomBytes } from "node:crypto";
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma, type KioskTryOnRun, type TryOnAsset } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { inlineTryOnResult } from "../common/inline-try-on-result.js";
import { validateTechnicalImageBuffer } from "../common/image-validation.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  DEFAULT_STARTER_PLAN_CODE,
  DEFAULT_TRIAL_CREDITS,
} from "../entitlements/default-trial.js";
import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { lockBillingSubscription } from "../entitlements/postpaid-billing.js";
import { CatalogService } from "../catalog/catalog.service.js";
import {
  ObjectStorageService,
  loadObjectStorageConfig,
} from "../storage/object-storage.js";
import { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import { TryOnSessionService } from "../try-on/try-on-session.service.js";
import {
  validateTryOnLabUploadedImage,
  type CreateTryOnLabRunPayload,
} from "../try-on-lab/try-on-lab-multipart.js";

const DAY = 86400000;
export const CUSTOMER_PHOTO_CONSENT_VERSION = "2026-10-26";
export const CUSTOMER_PHOTO_CONSENT =
  "I allow SelfX to upload and process the photos I choose for virtual Try-On. Original photos and outfit captures expire within 7 days. Generated results expire within 30 days. I can delete my photos and results earlier.";
export const CUSTOMER_STORE_CONSENT =
  "In this Store session, only eligible Store products can be tried on. The Store pays and can view the generated result; my original person photo remains private. My personal credits will not be used as a fallback.";
const terminal = ["COMPLETED", "FAILED"];
type Tx = Prisma.TransactionClient;
type Principal = { id: string; securityVersion: number };

export function personalTrialBalance(account: {
  trialCredits: number;
  usedCredits: number;
  reservedCredits: number;
}) {
  return {
    granted: account.trialCredits,
    used: account.usedCredits,
    reserved: account.reservedCredits,
    remaining: Math.max(
      0,
      account.trialCredits - account.usedCredits - account.reservedCredits,
    ),
  };
}
export function parseStoreQr(value: string): string {
  const raw = value.trim();
  let token = raw;
  if (raw.startsWith("selfx://")) {
    let uri: URL;
    try {
      uri = new URL(raw);
    } catch {
      fail("STORE_QR_INVALID", "Scan a SelfX Store QR code.");
    }
    if (
      uri.hostname !== "store" ||
      uri.port ||
      uri.searchParams.size !== 1 ||
      uri.searchParams.getAll("token").length !== 1 ||
      (uri.pathname && uri.pathname !== "/") ||
      uri.hash ||
      uri.username ||
      uri.password
    )
      fail("STORE_QR_INVALID", "Scan a SelfX Store QR code.");
    token = uri.searchParams.get("token") ?? "";
  }
  if (!/^[A-Za-z0-9_-]{43}$/.test(token))
    fail("STORE_QR_INVALID", "Scan a SelfX Store QR code.");
  return token;
}
function digest(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}
function fail(code: string, message: string, status = 400): never {
  throw new ApiErrorException(status, code, message);
}

@Injectable()
export class CustomerExperienceService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CustomerExperienceService.name);
  private timer?: ReturnType<typeof setInterval>;
  private cleaning = false;
  constructor(
    private readonly db: PrismaService,
    private readonly sessions: TryOnSessionService,
    private readonly execution: TryOnExecutionService,
    private readonly storage: ObjectStorageService,
    private readonly entitlements: EntitlementsService,
    private readonly catalog: CatalogService,
  ) {}

  onModuleInit() {
    if (process.env.SELFX_CUSTOMER_AUTH_ENABLED !== "true") return;
    this.timer = setInterval(
      () =>
        void this.cleanup().catch(() =>
          this.logger.warn({ event: "customer_media_cleanup_retry" }),
        ),
      60000,
    );
    this.timer.unref();
    void this.cleanup().catch(() =>
      this.logger.warn({ event: "customer_media_cleanup_pending" }),
    );
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async available() {
    if (process.env.SELFX_CUSTOMER_AUTH_ENABLED !== "true") return false;
    try {
      const config = loadObjectStorageConfig();
      if (
        ![
          config.endpoint,
          config.bucket,
          config.accessKeyId,
          config.secretAccessKey,
          config.region,
        ].every(Boolean)
      )
        return false;
      this.execution.assertConfigured();
      const rows = await this.db.$queryRaw<
        Array<{ ready: boolean }>
      >`SELECT to_regclass('public.customer_credit_accounts') IS NOT NULL AS ready`;
      return rows[0]?.ready === true;
    } catch {
      return false;
    }
  }

  private async lockCustomer(tx: Tx, customer: Principal) {
    await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customer.id}::uuid FOR UPDATE`;
    const current = await tx.customer.findUnique({
      where: { id: customer.id },
    });
    if (
      !current ||
      current.status !== "ACTIVE" ||
      current.securityVersion !== customer.securityVersion
    )
      fail("CUSTOMER_SESSION_INVALID", "Sign in again to continue.", 401);
  }
  private async account(tx: Tx, customerId: string) {
    const plan = await tx.pricingPlan.findUnique({
      where: { code: DEFAULT_STARTER_PLAN_CODE },
      select: { trialCredits: true },
    });
    return tx.customerCreditAccount.upsert({
      where: { customerId },
      update: {},
      create: {
        customerId,
        trialCredits: plan?.trialCredits ?? DEFAULT_TRIAL_CREDITS,
        trialPlanCode: DEFAULT_STARTER_PLAN_CODE,
      },
    });
  }
  async summary(customer: Principal) {
    const account = await this.db.$transaction(async (tx) => {
      await this.lockCustomer(tx, customer);
      return this.account(tx, customer.id);
    });
    const [generationAvailable, saved, pending] = await Promise.all([
      this.available(),
      this.db.tryOnLook.count({
        where: {
          session: { customerId: customer.id },
          expiresAt: { gt: new Date() },
          resultAsset: { deletedAt: null, readyAt: { not: null } },
        },
      }),
      this.db.kioskTryOnRun.findFirst({
        where: {
          customerId: customer.id,
          status: { in: ["QUEUED", "PROCESSING"] },
        },
        select: { id: true },
      }),
    ]);
    return {
      generationAvailable,
      consentVersion: CUSTOMER_PHOTO_CONSENT_VERSION,
      consentStatement: CUSTOMER_PHOTO_CONSENT,
      storeConsentStatement: CUSTOMER_STORE_CONSENT,
      trial: personalTrialBalance(account),
      plan: { kind: "FREE_TRIAL", name: "Free trial", paid: false },
      saved,
      pendingRunId: pending?.id ?? null,
      resultRetentionDays: 30,
      inputRetentionDays: 7,
    };
  }

  async createSession(
    customer: Principal,
    input: {
      consentAccepted: boolean;
      consentVersion: string;
      storeVisitId?: string;
    },
  ) {
    if (
      input.consentAccepted !== true ||
      input.consentVersion !== CUSTOMER_PHOTO_CONSENT_VERSION
    )
      fail(
        "CUSTOMER_PHOTO_CONSENT_REQUIRED",
        "Read and accept photo processing consent before choosing photos.",
      );
    if (!(await this.available()))
      fail(
        "CUSTOMER_GENERATION_UNAVAILABLE",
        "SelfX Try-On is temporarily unavailable. Please try again later.",
        503,
      );
    const visit = input.storeVisitId
      ? await this.requireVisit(customer.id, input.storeVisitId)
      : null;
    const consent = await this.db.$transaction(async (tx) => {
      await this.lockCustomer(tx, customer);
      return tx.customerPhotoConsent.create({
        data: {
          id: createSelfxId(),
          customerId: customer.id,
          storeVisitId: visit?.id,
          sponsoringStoreId: visit?.qr.organizationId,
          version: CUSTOMER_PHOTO_CONSENT_VERSION,
          statement:
            CUSTOMER_PHOTO_CONSENT +
            (visit ? ` ${CUSTOMER_STORE_CONSENT}` : ""),
          merchantResultAccess: Boolean(visit),
        },
      });
    });
    const session = await this.sessions.createSession({
      customerId: customer.id,
      customerConsentId: consent.id,
      customerStoreVisitId: visit?.id,
      assignmentScope: visit ? "ORGANIZATION" : "PLATFORM",
      organizationId: visit?.qr.organizationId ?? null,
      storeId: null,
      expiresAt: new Date(Date.now() + 30 * DAY),
    });
    return {
      id: session.id,
      expiresAt: session.expiresAt.toISOString(),
      payer: visit ? "STORE" : "PERSONAL",
      store: visit
        ? { id: visit.qr.organizationId, name: visit.qr.organization.name }
        : null,
    };
  }
  private async ownSession(customerId: string, id: string) {
    const session = await this.db.tryOnSession.findFirst({
      where: {
        id,
        customerId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        customerConsent: { withdrawnAt: null },
      },
      include: { customerConsent: true },
    });
    if (!session)
      fail(
        "CUSTOMER_SESSION_NOT_FOUND",
        "Start a new Try-On before choosing photos.",
        404,
      );
    return session;
  }
  async upload(
    customer: Principal,
    sessionId: string,
    purpose: "PERSON" | "GARMENT",
    body: Buffer,
    mimeType: string,
  ) {
    const session = await this.ownSession(customer.id, sessionId);
    if (session.customerStoreVisitId && purpose === "GARMENT")
      fail(
        "STORE_PRODUCT_REQUIRED",
        "Choose an eligible product from this Store.",
      );
    const image = validateTryOnLabUploadedImage(
      purpose === "PERSON" ? "personImage" : "garmentImage",
      "photo",
      mimeType,
      body,
    );
    const metadata = validateTechnicalImageBuffer({
      buffer: body,
      declaredContentType: mimeType,
      maxBytes: 16 * 1024 * 1024,
    });
    const count = await this.db.tryOnAsset.count({
      where: {
        session: { customerId: customer.id },
        purpose: { not: "RESULT" },
        deletedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (count >= 64)
      fail(
        "CUSTOMER_UPLOAD_LIMIT",
        "Delete an older photo before uploading another one.",
        429,
      );
    const storageKey = `customer-mobile/inputs/${customer.id}/${session.id}/${createSelfxId()}`;
    const storageInput = {
      sessionId,
      customerId: customer.id,
      storageKey,
      contentType: image.mimeType,
      sizeBytes: body.length,
      width: metadata.width,
      height: metadata.height,
      readyAt: null,
      expiresAt: new Date(Date.now() + 7 * DAY),
    };
    const asset =
      purpose === "PERSON"
        ? await this.sessions.attachPersonAsset(storageInput)
        : await this.sessions.attachGarmentAsset(storageInput);
    try {
      await this.storage.putObject({
        key: storageKey,
        contentType: image.mimeType,
        body,
        timeoutMs: 60000,
      });
      const updated = await this.db.tryOnAsset.updateMany({
        where: {
          id: asset.id,
          deletedAt: null,
          session: { customerId: customer.id, customer: { status: "ACTIVE" } },
        },
        data: { readyAt: new Date() },
      });
      if (!updated.count) throw new Error("Upload was cancelled");
      return this.assetDto({ ...asset, readyAt: new Date() });
    } catch {
      await this.db.tryOnAsset.update({
        where: { id: asset.id },
        data: {
          deletedAt: new Date(),
          expiresAt: new Date(),
          storageDeletedAt: null,
        },
      });
      fail(
        "CUSTOMER_UPLOAD_FAILED",
        "Your photo could not be uploaded. Please try again.",
        503,
      );
    }
  }
  private assetDto(asset: TryOnAsset | null) {
    if (
      !asset ||
      asset.deletedAt ||
      !asset.readyAt ||
      asset.expiresAt <= new Date()
    )
      return null;
    const ttl = Math.min(
      60,
      Math.floor((asset.expiresAt.getTime() - Date.now()) / 1000),
    );
    if (ttl < 1) return null;
    return {
      id: asset.id,
      url: this.storage.createReadUrl({
        key: asset.storageKey,
        expiresInSeconds: ttl,
      }),
      expiresAt: asset.expiresAt.toISOString(),
      width: asset.width,
      height: asset.height,
    };
  }
  async getAsset(customerId: string, id: string) {
    const asset = await this.db.tryOnAsset.findFirst({
      where: {
        id,
        session: { customerId },
        deletedAt: null,
        readyAt: { not: null },
        expiresAt: { gt: new Date() },
      },
    });
    if (!asset)
      fail(
        "CUSTOMER_PHOTO_NOT_FOUND",
        "This photo has expired or was deleted.",
        404,
      );
    return this.assetDto(asset);
  }
  async downloadResult(customerId: string, id: string) {
    const asset = await this.db.tryOnAsset.findFirst({
      where: {
        id,
        purpose: "RESULT",
        session: { customerId },
        deletedAt: null,
        readyAt: { not: null },
        expiresAt: { gt: new Date() },
      },
    });
    if (!asset)
      fail(
        "CUSTOMER_PHOTO_NOT_FOUND",
        "This result has expired or was deleted.",
        404,
      );
    const body = await this.storage.readObject(
      asset.storageKey,
      20 * 1024 * 1024,
      60000,
    );
    return {
      body,
      contentType: asset.contentType ?? "image/png",
      extension:
        asset.contentType === "image/jpeg"
          ? "jpg"
          : asset.contentType === "image/webp"
            ? "webp"
            : "png",
    };
  }

  async createRun(
    customer: Principal,
    input: {
      sessionId: string;
      clientRequestId: string;
      personAssetId: string;
      garmentAssetId?: string;
      productId?: string;
    },
  ) {
    const fingerprint = digest(
      JSON.stringify([
        input.sessionId,
        input.personAssetId,
        input.garmentAssetId ?? null,
        input.productId ?? null,
      ]),
    );
    const existing = await this.db.kioskTryOnRun.findUnique({
      where: {
        customerId_clientRequestId: {
          customerId: customer.id,
          clientRequestId: input.clientRequestId,
        },
      },
    });
    if (existing) {
      if (existing.customerRequestFingerprint !== fingerprint)
        fail(
          "CUSTOMER_REQUEST_CONFLICT",
          "Start a new Try-On for different photos.",
          409,
        );
      return this.getRun(customer.id, existing.id);
    }
    const session = await this.ownSession(customer.id, input.sessionId);
    const visit = session.customerStoreVisitId
      ? await this.requireVisit(customer.id, session.customerStoreVisitId)
      : null;
    if (visit && (!input.productId || input.garmentAssetId))
      fail(
        "STORE_PRODUCT_REQUIRED",
        "Choose an eligible product from this Store.",
      );
    if (!visit && (!input.garmentAssetId || input.productId))
      fail("CUSTOMER_OUTFIT_REQUIRED", "Choose your outfit photo.");
    const person = await this.requireInput(
      customer.id,
      session.id,
      input.personAssetId,
      "PERSON",
    );
    const personBody = await this.storage.readObject(
      person.storageKey,
      16 * 1024 * 1024,
      60000,
    );
    const personImage = validateTryOnLabUploadedImage(
      "personImage",
      "person",
      person.contentType!,
      personBody,
    );
    const product = visit
      ? await this.catalog.resolveKioskProductForTryOn(
          visit.qr.organizationId,
          input.productId!,
        )
      : null;
    let garment: TryOnAsset;
    if (product) {
      // Catalog assets are selected server-side; a Store session never accepts a shopper's arbitrary outfit.
      const copy = await this.storeCatalogCopy(
        customer,
        session.id,
        product.garmentImage.buffer,
        product.garmentImage.mimeType,
      );
      garment = copy;
    } else
      garment = await this.requireInput(
        customer.id,
        session.id,
        input.garmentAssetId!,
        "GARMENT",
      );
    const garmentBody = await this.storage.readObject(
      garment.storageKey,
      16 * 1024 * 1024,
      60000,
    );
    const garmentImage = validateTryOnLabUploadedImage(
      "garmentImage",
      "outfit",
      garment.contentType!,
      garmentBody,
    );
    const payload: CreateTryOnLabRunPayload = {
      personImage,
      garmentImage,
      garmentSource: product ? "SELFX_CATALOG" : "DIRECT_UPLOAD",
      garmentIntent: (product?.garmentIntent ??
        "AUTO") as CreateTryOnLabRunPayload["garmentIntent"],
      category: (product?.garmentCategory ??
        "AUTO") as CreateTryOnLabRunPayload["category"],
      garmentPhotoType: (product?.garmentPhotoType ??
        "AUTO") as CreateTryOnLabRunPayload["garmentPhotoType"],
      generationProfile: "BALANCED",
      categoryResolutionSource: product
        ? "SELFX_CATALOG_METADATA"
        : "AUTO_FALLBACK",
      photoTypeResolutionSource: product
        ? "SELFX_CATALOG_METADATA"
        : "AUTO_FALLBACK",
      profileResolutionSource: "PLATFORM_DEFAULT",
      disambiguationRequired: false,
      disambiguationResolved: false,
      garmentAnalysisReasonCodes: [],
      qualityWarningCodes: [],
      qualityOverrideAccepted: false,
    };
    this.execution.assertConfigured();
    if (visit)
      await this.entitlements.ensureTrialCredits(visit.qr.organizationId);
    const provider = this.execution.metadata();
    const outcome = await this.db.$transaction(
      async (tx) => {
        await this.lockCustomer(tx, customer);
        const repeat = await tx.kioskTryOnRun.findUnique({
          where: {
            customerId_clientRequestId: {
              customerId: customer.id,
              clientRequestId: input.clientRequestId,
            },
          },
        });
        if (repeat) {
          if (repeat.customerRequestFingerprint !== fingerprint)
            fail(
              "CUSTOMER_REQUEST_CONFLICT",
              "Start a new Try-On for different photos.",
              409,
            );
          return { run: repeat, created: false };
        }
        const live = await tx.tryOnSession.findFirst({
          where: {
            id: session.id,
            customerId: customer.id,
            status: "ACTIVE",
            expiresAt: { gt: new Date() },
            customerConsent: { withdrawnAt: null },
          },
        });
        if (!live)
          fail(
            "CUSTOMER_SESSION_NOT_FOUND",
            "This photo session has ended.",
            409,
          );
        const readyInputs = await tx.tryOnAsset.count({
          where: {
            id: { in: [person.id, garment.id] },
            sessionId: session.id,
            deletedAt: null,
            readyAt: { not: null },
            expiresAt: { gt: new Date() },
          },
        });
        if (readyInputs !== 2)
          fail(
            "CUSTOMER_PHOTO_NOT_FOUND",
            "Choose current photos before trying on.",
            409,
          );
        if (
          await tx.kioskTryOnRun.count({
            where: {
              customerId: customer.id,
              status: { in: ["QUEUED", "PROCESSING"] },
            },
          })
        )
          fail(
            "CUSTOMER_TRYON_IN_PROGRESS",
            "Wait for your current Try-On to finish.",
            409,
          );
        const id = createSelfxId();
        let admission:
          | Awaited<ReturnType<EntitlementsService["consumeTryOnCredit"]>>
          | undefined;
        if (visit) {
          await this.assertStoreAdmission(tx, customer.id, visit.id);
          admission = await this.entitlements.consumeTryOnCredit(
            {
              organizationId: visit.qr.organizationId,
              channel: "MOBILE",
              idempotencyKey: `customer-store:${id}`,
              kioskTryOnRunId: id,
              tryOnSessionId: session.id,
              productId: input.productId,
              reason: "Store-sponsored mobile Try-On",
            },
            tx,
          );
        } else {
          const account = await this.account(tx, customer.id);
          if (personalTrialBalance(account).remaining < 1)
            fail(
              "CUSTOMER_TRIAL_EXHAUSTED",
              "Your free trial credits are used up. You can still use a participating Store's QR session.",
              402,
            );
          await tx.customerCreditAccount.update({
            where: { customerId: customer.id },
            data: { reservedCredits: { increment: 1 } },
          });
        }
        const run = await tx.kioskTryOnRun.create({
          data: {
            id,
            customerId: customer.id,
            customerRequestFingerprint: fingerprint,
            customerCreditState: visit ? null : "RESERVED",
            clientRequestId: input.clientRequestId,
            tryOnSessionId: session.id,
            assignmentScope: session.assignmentScope,
            organizationId: session.organizationId,
            storeId: null,
            kioskDeviceId: null,
            billingChannel: "MOBILE",
            billingCycleId: admission?.billingCycleId,
            shopifyReservationId: admission?.shopifyReservationId,
            personAssetId: person.id,
            garmentAssetId: garment.id,
            productId: input.productId,
            catalogSource: product ? "SELFX" : null,
            provider: provider.provider,
            providerDisplayName: provider.providerDisplayName,
            providerModel: provider.model,
            garmentSource: payload.garmentSource,
            garmentIntent: payload.garmentIntent,
            garmentCategory: payload.category,
            garmentPhotoType: payload.garmentPhotoType,
            generationProfile: payload.generationProfile,
            expiresAt: new Date(Date.now() + 30 * DAY),
          },
        });
        return { run, created: true };
      },
      { timeout: 15000 },
    );
    if (outcome.created)
      void this.process(outcome.run, payload).catch(() =>
        this.logger.warn({
          event: "customer_tryon_finalization_retry",
          runId: outcome.run.id,
        }),
      );
    return this.getRun(customer.id, outcome.run.id);
  }
  private async requireInput(
    customerId: string,
    sessionId: string,
    id: string,
    purpose: "PERSON" | "GARMENT",
  ) {
    const asset = await this.db.tryOnAsset.findFirst({
      where: {
        id,
        sessionId,
        purpose,
        session: { customerId },
        deletedAt: null,
        readyAt: { not: null },
        expiresAt: { gt: new Date() },
      },
    });
    if (!asset)
      fail(
        "CUSTOMER_PHOTO_NOT_FOUND",
        "Choose a current photo from this Try-On session.",
        404,
      );
    return asset;
  }
  private async storeCatalogCopy(
    customer: Principal,
    sessionId: string,
    body: Buffer,
    mimeType: string,
  ) {
    const metadata = validateTechnicalImageBuffer({
      buffer: body,
      declaredContentType: mimeType,
      maxBytes: 16 * 1024 * 1024,
    });
    const storageKey = `customer-mobile/inputs/${customer.id}/${sessionId}/${createSelfxId()}`;
    const asset = await this.sessions.attachGarmentAsset({
      customerId: customer.id,
      sessionId,
      storageKey,
      contentType: metadata.mimeType,
      sizeBytes: body.length,
      width: metadata.width,
      height: metadata.height,
      readyAt: null,
      expiresAt: new Date(Date.now() + 7 * DAY),
    });
    try {
      await this.storage.putObject({
        key: storageKey,
        contentType: metadata.mimeType,
        body,
        timeoutMs: 60000,
      });
      const updated = await this.db.tryOnAsset.updateMany({
        where: {
          id: asset.id,
          deletedAt: null,
          session: {
            status: "ACTIVE",
            customer: { status: "ACTIVE" },
            customerConsent: { withdrawnAt: null },
          },
        },
        data: { readyAt: new Date() },
      });
      if (!updated.count)
        fail(
          "CUSTOMER_SESSION_NOT_FOUND",
          "This Try-On session has ended.",
          409,
        );
      return this.db.tryOnAsset.findUniqueOrThrow({ where: { id: asset.id } });
    } catch (error) {
      await this.db.tryOnAsset.update({
        where: { id: asset.id },
        data: {
          deletedAt: new Date(),
          expiresAt: new Date(),
          storageDeletedAt: null,
        },
      });
      throw error;
    }
  }
  private async process(run: KioskTryOnRun, payload: CreateTryOnLabRunPayload) {
    await this.execution.process(payload, {
      onStarted: async (startedAt) => {
        await this.db.kioskTryOnRun.updateMany({
          where: { id: run.id, status: "QUEUED" },
          data: { startedAt },
        });
      },
      onSubmitted: async (providerPredictionId) => {
        await this.db.kioskTryOnRun.updateMany({
          where: { id: run.id, status: { in: ["QUEUED", "PROCESSING"] } },
          data: {
            status: "PROCESSING",
            providerPredictionId,
            submittedAt: new Date(),
          },
        });
      },
      onStatus: async (status) => {
        if (status.status === "COMPLETED" && status.resultImage)
          await this.persistResult(run, status.resultImage);
        else if (status.status === "FAILED")
          await this.failRun(run.id, status.errorCode ?? "TRY_ON_FAILED");
      },
      onTimedOut: async () => {
        await this.failRun(run.id, "TRY_ON_TIMEOUT");
      },
      onError: async (error) => {
        await this.failRun(run.id, error.errorCode);
      },
    });
  }
  private async persistResult(run: KioskTryOnRun, image: string) {
    const before = await this.db.kioskTryOnRun.findUnique({
      where: { id: run.id },
      select: { status: true },
    });
    if (!before || terminal.includes(before.status)) return;
    const inline = await inlineTryOnResult(image);
    const match =
      /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(
        inline,
      );
    if (!match) throw new Error("Invalid result format");
    const body = Buffer.from(match[2]!, "base64");
    const metadata = validateTechnicalImageBuffer({
      buffer: body,
      declaredContentType: match[1],
      maxBytes: 20 * 1024 * 1024,
    });
    const expiresAt = new Date(Date.now() + 30 * DAY);
    const asset = await this.db.tryOnAsset.create({
      data: {
        id: createSelfxId(),
        sessionId: run.tryOnSessionId!,
        purpose: "RESULT",
        assignmentScope: run.assignmentScope,
        organizationId: run.organizationId,
        storeId: null,
        kioskDeviceId: null,
        storageKey: `customer-mobile/results/${run.customerId}/${run.tryOnSessionId}/${run.id}`,
        contentType: metadata.mimeType,
        sizeBytes: body.length,
        width: metadata.width,
        height: metadata.height,
        readyAt: null,
        expiresAt,
      },
    });
    try {
      await this.storage.putObject({
        key: asset.storageKey,
        contentType: metadata.mimeType,
        body,
        timeoutMs: 60000,
      });
      await this.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM customers WHERE id = ${run.customerId}::uuid FOR UPDATE`;
        const current = await tx.kioskTryOnRun.findFirst({
          where: {
            id: run.id,
            status: { in: ["QUEUED", "PROCESSING"] },
            customer: { status: "ACTIVE" },
            tryOnSession: {
              status: "ACTIVE",
              customerConsent: { withdrawnAt: null },
            },
          },
        });
        if (!current) throw new Error("Run ended before its result was saved");
        const now = new Date();
        await tx.tryOnAsset.update({
          where: { id: asset.id },
          data: { readyAt: now },
        });
        await tx.kioskTryOnRun.update({
          where: { id: run.id },
          data: {
            status: "COMPLETED",
            completedAt: now,
            expiresAt,
            resultImage: null,
            customerCreditState: run.organizationId ? null : "USED",
          },
        });
        await this.sessions.recordLook(
          {
            customerId: run.customerId!,
            sessionId: run.tryOnSessionId!,
            kioskTryOnRunId: run.id,
            personAssetId: run.personAssetId!,
            garmentAssetId: run.garmentAssetId,
            productId: run.productId,
            expiresAt,
            existingResultAssetId: asset.id,
            resultAsset: { storageKey: asset.storageKey, expiresAt },
          },
          tx,
        );
        if (!run.organizationId && current.customerCreditState === "RESERVED")
          await tx.customerCreditAccount.update({
            where: { customerId: run.customerId! },
            data: {
              reservedCredits: { decrement: 1 },
              usedCredits: { increment: 1 },
            },
          });
      });
    } catch (error) {
      await this.db.tryOnAsset.update({
        where: { id: asset.id },
        data: {
          deletedAt: new Date(),
          expiresAt: new Date(),
          storageDeletedAt: null,
        },
      });
      throw error;
    }
  }
  async failRun(id: string, errorCode: string) {
    await this.db.$transaction(async (tx) => {
      const run = await tx.kioskTryOnRun.findUnique({ where: { id } });
      if (!run?.customerId || terminal.includes(run.status)) return;
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${run.customerId}::uuid FOR UPDATE`;
      const changed = await tx.kioskTryOnRun.updateMany({
        where: { id, status: { in: ["QUEUED", "PROCESSING"] } },
        data: {
          status: "FAILED",
          errorCode,
          errorMessage: "We couldn't create this look. Please try again.",
          completedAt: new Date(),
          customerCreditState:
            run.customerCreditState === "RESERVED"
              ? "RELEASED"
              : run.customerCreditState,
        },
      });
      if (!changed.count) return;
      if (!run.organizationId && run.customerCreditState === "RESERVED")
        await tx.customerCreditAccount.update({
          where: { customerId: run.customerId },
          data: { reservedCredits: { decrement: 1 } },
        });
      if (run.organizationId)
        await this.entitlements.refundFailedTryOnCredit(
          {
            organizationId: run.organizationId,
            runId: run.id,
            debitKey: `customer-store:${run.id}`,
            shopifyReservationId: run.shopifyReservationId,
          },
          tx,
        );
    });
  }
  async getRun(customerId: string, id: string) {
    const run = await this.db.kioskTryOnRun.findFirst({
      where: { id, customerId },
      include: { resultAsset: true },
    });
    if (!run || run.expiresAt <= new Date())
      fail(
        "CUSTOMER_TRYON_NOT_FOUND",
        "This Try-On has expired or was deleted.",
        404,
      );
    return {
      id: run.id,
      sessionId: run.tryOnSessionId,
      status: run.status,
      payer: run.organizationId ? "STORE" : "PERSONAL",
      createdAt: run.createdAt.toISOString(),
      expiresAt:
        run.resultAsset?.expiresAt.toISOString() ?? run.expiresAt.toISOString(),
      result:
        run.status === "COMPLETED" ? this.assetDto(run.resultAsset) : null,
      errorCode: run.status === "FAILED" ? run.errorCode : null,
      message:
        run.status === "FAILED"
          ? run.organizationId
            ? "We couldn't create this look. The Store was not charged for this result."
            : "We couldn't create this look. Your credit is available to try again."
          : null,
    };
  }
  async saved(customerId: string, page = 1) {
    const take = 20,
      now = new Date();
    const where: Prisma.TryOnLookWhereInput = {
      session: { customerId },
      expiresAt: { gt: now },
      resultAsset: {
        deletedAt: null,
        readyAt: { not: null },
        expiresAt: { gt: now },
      },
    };
    const [total, rows] = await Promise.all([
      this.db.tryOnLook.count({ where }),
      this.db.tryOnLook.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take,
        skip: (page - 1) * take,
        include: {
          resultAsset: true,
          garmentAsset: true,
          personAsset: true,
          product: { select: { name: true } },
        },
      }),
    ]);
    return {
      data: rows.map((row) => ({
        id: row.id,
        runId: row.kioskTryOnRunId,
        name: row.product?.name ?? "Your look",
        createdAt: row.createdAt.toISOString(),
        expiresAt: row.expiresAt.toISOString(),
        result: this.assetDto(row.resultAsset),
        person: this.assetDto(row.personAsset),
        outfit: this.assetDto(row.garmentAsset),
        payer: row.organizationId ? "STORE" : "PERSONAL",
      })),
      pagination: { page, total, hasMore: page * take < total },
    };
  }
  async deleteLook(customerId: string, id: string) {
    const look = await this.db.tryOnLook.findFirst({
      where: { id, session: { customerId } },
    });
    if (!look)
      fail("CUSTOMER_LOOK_NOT_FOUND", "This saved look was not found.", 404);
    const now = new Date();
    await this.db.$transaction([
      this.db.tryOnLook.update({ where: { id }, data: { expiresAt: now } }),
      this.db.tryOnAsset.update({
        where: { id: look.resultAssetId },
        data: { expiresAt: now, deletedAt: now },
      }),
    ]);
    await this.cleanup();
    return { message: "Look deleted." };
  }
  async eraseCustomerPhotos(customerId: string) {
    await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM customers WHERE id = ${customerId}::uuid FOR UPDATE`;
      const active = await tx.kioskTryOnRun.findMany({
        where: { customerId, status: { in: ["QUEUED", "PROCESSING"] } },
      });
      for (const run of active) {
        await tx.kioskTryOnRun.update({
          where: { id: run.id },
          data: {
            status: "FAILED",
            errorCode: "CUSTOMER_SESSION_ENDED",
            completedAt: new Date(),
            customerCreditState:
              run.customerCreditState === "RESERVED"
                ? "RELEASED"
                : run.customerCreditState,
          },
        });
        if (!run.organizationId && run.customerCreditState === "RESERVED")
          await tx.customerCreditAccount.update({
            where: { customerId },
            data: { reservedCredits: { decrement: 1 } },
          });
        if (run.organizationId)
          await this.entitlements.refundFailedTryOnCredit(
            {
              organizationId: run.organizationId,
              runId: run.id,
              debitKey: "customer-store:" + run.id,
              shopifyReservationId: run.shopifyReservationId,
            },
            tx,
          );
      }
      const now = new Date();
      await tx.tryOnAsset.updateMany({
        where: { session: { customerId }, storageDeletedAt: null },
        data: { deletedAt: now, expiresAt: now },
      });
      await tx.tryOnLook.updateMany({
        where: { session: { customerId } },
        data: { expiresAt: now },
      });
      await tx.tryOnSession.updateMany({
        where: { customerId },
        data: {
          status: "COMPLETED",
          completedAt: now,
          currentPersonAssetId: null,
        },
      });
      await tx.customerPhotoConsent.updateMany({
        where: { customerId, withdrawnAt: null },
        data: { withdrawnAt: now },
      });
      await tx.customerStoreVisit.updateMany({
        where: { customerId, endedAt: null },
        data: { endedAt: now },
      });
    });
    await this.cleanup();
  }

  async createQr(
    organizationId: string,
    createdByUserId: string,
    label: string,
    dailyCustomerLimit: number,
  ) {
    await this.requireStore(organizationId);
    const token = randomBytes(32).toString("base64url");
    const row = await this.db.customerStoreQr.create({
      data: {
        id: createSelfxId(),
        organizationId,
        createdByUserId,
        tokenHash: digest(token),
        label,
        dailyCustomerLimit,
        expiresAt: new Date(Date.now() + 365 * DAY),
      },
    });
    return { ...this.qrDto(row), payload: `selfx://store?token=${token}` };
  }
  private qrDto(row: {
    id: string;
    label: string;
    dailyCustomerLimit: number;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      label: row.label,
      dailyCustomerLimit: row.dailyCustomerLimit,
      expiresAt: row.expiresAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
  async listQrs(organizationId: string) {
    return {
      data: (
        await this.db.customerStoreQr.findMany({
          where: { organizationId },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      ).map((row) => this.qrDto(row)),
    };
  }
  async revokeQr(organizationId: string, id: string, actorId: string) {
    await this.db.customerStoreQr.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date(), revokedByUserId: actorId },
    });
    return { message: "QR access revoked." };
  }
  async joinStore(customerId: string, value: string) {
    const qr = await this.db.customerStoreQr.findUnique({
      where: { tokenHash: digest(parseStoreQr(value)) },
      include: { organization: true },
    });
    if (
      !qr ||
      qr.revokedAt ||
      qr.expiresAt <= new Date() ||
      qr.organization.status !== "ACTIVE"
    )
      fail(
        "STORE_QR_UNAVAILABLE",
        "This Store QR is expired or unavailable.",
        404,
      );
    const visit = await this.db.customerStoreVisit.create({
      data: {
        id: createSelfxId(),
        customerId,
        qrId: qr.id,
        expiresAt: new Date(Date.now() + 2 * 3600000),
      },
    });
    return {
      id: visit.id,
      expiresAt: visit.expiresAt.toISOString(),
      store: { id: qr.organizationId, name: qr.organization.name },
      dailyCustomerLimit: qr.dailyCustomerLimit,
      payer: "STORE",
    };
  }
  private async requireVisit(customerId: string, id: string) {
    const visit = await this.db.customerStoreVisit.findFirst({
      where: {
        id,
        customerId,
        endedAt: null,
        expiresAt: { gt: new Date() },
        qr: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
          organization: { status: "ACTIVE" },
        },
      },
      include: { qr: { include: { organization: true } } },
    });
    if (!visit)
      fail(
        "STORE_SESSION_EXPIRED",
        "This Store session has ended. Scan the Store's QR again.",
        404,
      );
    return visit;
  }
  async storeProducts(customerId: string, id: string, page = 1) {
    const visit = await this.requireVisit(customerId, id);
    return this.catalog.listKioskProducts(visit.qr.organizationId, {
      page,
      pageSize: 20,
      productVertical: "GARMENT",
    });
  }
  async leaveStore(customerId: string, id: string) {
    await this.db.customerStoreVisit.updateMany({
      where: { id, customerId },
      data: { endedAt: new Date() },
    });
    return {
      message: "Store session ended. Personal Try-Ons use your own allowance.",
    };
  }
  private async requireStore(id: string) {
    const store = await this.db.organization.findFirst({
      where: { id, status: "ACTIVE" },
    });
    if (!store) fail("STORE_UNAVAILABLE", "This Store is unavailable.", 404);
    return store;
  }
  private async assertStoreAdmission(
    tx: Tx,
    customerId: string,
    visitId: string,
  ) {
    const visit = await tx.customerStoreVisit.findFirst({
      where: {
        id: visitId,
        customerId,
        endedAt: null,
        expiresAt: { gt: new Date() },
        qr: {
          revokedAt: null,
          expiresAt: { gt: new Date() },
          organization: { status: "ACTIVE" },
        },
      },
      include: { qr: true },
    });
    if (!visit) fail("STORE_SESSION_EXPIRED", "Scan the Store QR again.", 409);
    await lockBillingSubscription(tx, visit.qr.organizationId);
    const subscription = await tx.storeSubscription.findUnique({
      where: { organizationId: visit.qr.organizationId },
    });
    if (
      !subscription ||
      !["TRIALING", "ACTIVE"].includes(subscription.status) ||
      !Array.isArray(subscription.channels) ||
      !subscription.channels.includes("MOBILE")
    )
      fail(
        "STORE_MOBILE_UNAVAILABLE",
        "This Store's plan does not currently include Store QR Try-On.",
        402,
      );
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const count = await tx.kioskTryOnRun.count({
      where: {
        customerId,
        organizationId: visit.qr.organizationId,
        billingChannel: "MOBILE",
        createdAt: { gte: today },
        status: { in: ["QUEUED", "PROCESSING", "COMPLETED"] },
      },
    });
    if (count >= visit.qr.dailyCustomerLimit)
      fail(
        "STORE_VISITOR_LIMIT",
        "You have reached this Store's daily Try-On limit. Your personal credits have not been used.",
        429,
      );
  }
  async cleanup() {
    if (this.cleaning) return;
    this.cleaning = true;
    try {
      const now = new Date();
      const stale = await this.db.kioskTryOnRun.findMany({
        where: {
          customerId: { not: null },
          status: { in: ["QUEUED", "PROCESSING"] },
          createdAt: { lt: new Date(Date.now() - 12 * 60000) },
        },
        take: 100,
        select: { id: true },
      });
      for (const row of stale) await this.failRun(row.id, "TRY_ON_TIMEOUT");
      const expired = await this.db.tryOnAsset.findMany({
        where: {
          storageDeletedAt: null,
          session: { customerId: { not: null } },
          AND: [
            {
              OR: [
                { readyAt: { not: null } },
                { createdAt: { lt: new Date(Date.now() - 5 * 60000) } },
              ],
            },
          ],
          OR: [
            { expiresAt: { lte: now } },
            { deletedAt: { not: null } },
            { session: { customer: { status: "DELETED" } } },
          ],
        },
        take: 100,
      });
      for (const row of expired) {
        try {
          await this.storage.deleteObject(row.storageKey);
          await this.db.tryOnAsset.update({
            where: { id: row.id },
            data: { deletedAt: now, storageDeletedAt: now, readyAt: null },
          });
        } catch {
          this.logger.warn({
            event: "customer_asset_delete_retry",
            assetId: row.id,
          });
        }
      }
    } finally {
      this.cleaning = false;
    }
  }
}
