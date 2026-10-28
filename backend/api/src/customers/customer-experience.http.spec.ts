import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";
import {
  beforeAll,
  beforeEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import {
  CustomerExperienceController,
  CustomerStoreQrController,
} from "./customer-experience.controller.js";
import { CustomerExperienceService } from "./customer-experience.service.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { AuthService } from "../auth/auth.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { StoreImpersonationService } from "../stores/store-impersonation.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { CustomerProfilePhotoController } from "./customer-profile-photo.controller.js";
import { CustomerProfilePhotoService } from "./customer-profile-photo.service.js";
import { CustomerAvatarController } from "./customer-avatar.controller.js";
import { PrismaService } from "../database/prisma.service.js";

describe("Customer photo HTTP and Store QR permission boundaries", () => {
  let app: NestFastifyApplication;
  const customer = { id: randomUUID(), securityVersion: 0 },
    storeId = randomUUID();
  const auth = { requireCustomer: vi.fn(), limitExperience: vi.fn() };
  const photos = {
    get: vi.fn(),
    content: vi.fn(),
    upload: vi.fn(),
    remove: vi.fn(),
  };
  const staff = { requireAccessUser: vi.fn() },
    rbac = { requireStoreResourcePermission: vi.fn() },
    impersonation = { resolveStoreContext: vi.fn() };
  const experience = {
    summary: vi.fn(),
    createSession: vi.fn(),
    createRun: vi.fn(),
    useDemo: vi.fn(),
    getAsset: vi.fn(),
    upload: vi.fn(),
    downloadResult: vi.fn(),
    listQrs: vi.fn(),
    createQr: vi.fn(),
    revokeQr: vi.fn(),
    saved: vi.fn(),
    joinStore: vi.fn(),
  };
  beforeAll(async () => {
    @Module({
      controllers: [
        CustomerExperienceController,
        CustomerStoreQrController,
        CustomerProfilePhotoController,
        CustomerAvatarController,
      ],
      providers: [
        { provide: PrismaService, useValue: {} },
        { provide: CustomerAuthService, useValue: auth },
        { provide: CustomerExperienceService, useValue: experience },
        { provide: CustomerProfilePhotoService, useValue: photos },
        { provide: AuthService, useValue: staff },
        { provide: StoreRbacService, useValue: rbac },
        { provide: StoreImpersonationService, useValue: impersonation },
      ],
    })
    class TestModule {}
    app = await NestFactory.create<NestFastifyApplication>(
      TestModule,
      new FastifyAdapter(),
      { logger: false, abortOnError: false },
    );
    await app.register(multipart);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  }, 60000);
  beforeEach(() => {
    vi.resetAllMocks();
    auth.requireCustomer.mockResolvedValue({ customer });
    staff.requireAccessUser.mockResolvedValue({ id: "staff-actor" });
    experience.summary.mockResolvedValue({ trial: { remaining: 10 } });
    experience.listQrs.mockResolvedValue({ data: [] });
    experience.createQr.mockResolvedValue({ id: randomUUID() });
  });
  afterAll(async () => {
    await app.close();
  });
  it("avatar routes enforce identity, kind, ownership and consent before making a temporary Try-On input", async () => {
    const photoId = randomUUID(),
      sessionId = randomUUID();
    photos.get.mockResolvedValue({ photo: { id: photoId, expiresAt: null } });
    photos.content.mockResolvedValue(Buffer.from("avatar"));
    experience.upload.mockResolvedValue({
      id: randomUUID(),
      expiresAt: new Date().toISOString(),
    });
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/customer/try-on/sessions/${sessionId}/avatar`,
    });
    expect(response.statusCode).toBe(201);
    expect(photos.get).toHaveBeenCalledWith(customer.id, "FULL_BODY");
    expect(photos.content).toHaveBeenCalledWith(
      customer.id,
      photoId,
      "FULL_BODY",
    );
    expect(experience.upload).toHaveBeenCalledWith(
      customer,
      sessionId,
      "PERSON",
      Buffer.from("avatar"),
      "image/jpeg",
    );
    const wrongKind = await app.inject({
      method: "GET",
      url: `/api/v1/customer/me/avatar/PROFILE/${photoId}/content`,
    });
    expect(wrongKind.statusCode).toBe(400);
    const oldConsent = await app.inject({
      method: "POST",
      url: "/api/v1/customer/me/avatar/FULL_BODY?consentVersion=2026-10-27-v2&consentLanguage=en",
    });
    expect(oldConsent.statusCode).toBe(400);
    for (const interests of [[], ["OTHER"], ["MEN", "MEN"]]) {
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: "/api/v1/customer/me/avatar",
            payload: { interests },
          })
        ).statusCode,
      ).toBe(400);
    }
    auth.requireCustomer.mockRejectedValue(
      new ApiErrorException(401, "CUSTOMER_UNAUTHORIZED", "Sign in"),
    );
    experience.upload.mockClear();
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/customer/try-on/sessions/${sessionId}/avatar`,
        })
      ).statusCode,
    ).toBe(401);
    expect(experience.upload).not.toHaveBeenCalled();
  });
  it("serves the shared demo catalog and copies only an authenticated choice", async () => {
    const list = await app.inject({
      method: "GET",
      url: "/api/v1/customer/demo-catalog",
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json().products.map((item: { id: string }) => item.id),
    ).toContain("terracotta-blazer");
    expect(list.json().models.map((item: { id: string }) => item.id)).toContain(
      "muse",
    );
    const sessionId = randomUUID();
    experience.useDemo.mockResolvedValue({ id: randomUUID() });
    const chosen = await app.inject({
      method: "POST",
      url: `/api/v1/customer/try-on/sessions/${sessionId}/demo/GARMENT`,
      payload: { id: "terracotta-blazer" },
    });
    expect(chosen.statusCode).toBe(201);
    expect(experience.useDemo).toHaveBeenCalledWith(
      customer,
      sessionId,
      "GARMENT",
      "terracotta-blazer",
    );
    const badPurpose = await app.inject({
      method: "POST",
      url: `/api/v1/customer/try-on/sessions/${sessionId}/demo/RESULT`,
      payload: { id: "terracotta-blazer" },
    });
    expect(badPurpose.statusCode).toBe(400);
    auth.requireCustomer.mockRejectedValue(
      new ApiErrorException(401, "CUSTOMER_UNAUTHORIZED", "Sign in"),
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/customer/demo-catalog",
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/customer/try-on/sessions/${sessionId}/demo/PERSON`,
          payload: { id: "muse" },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("profile photo routes authenticate owners, require current consent and stream only private content", async () => {
    photos.get.mockResolvedValue({ photo: null });
    photos.content.mockResolvedValue(Buffer.from("synthetic-jpeg"));
    const read = await app.inject({
      method: "GET",
      url: "/api/v1/customer/me/photo",
    });
    expect(read.statusCode).toBe(200);
    expect(read.headers["cache-control"]).toBe("no-store");
    expect(photos.get).toHaveBeenCalledWith(customer.id);
    const id = randomUUID();
    const content = await app.inject({
      method: "GET",
      url: `/api/v1/customer/me/photo/${id}/content`,
    });
    expect(content.headers["content-type"]).toContain("image/jpeg");
    expect(content.headers["x-content-type-options"]).toBe("nosniff");
    expect(photos.content).toHaveBeenCalledWith(customer.id, id);
    const invalidConsent = await app.inject({
      method: "POST",
      url: "/api/v1/customer/me/photo?consentVersion=old&consentLanguage=en",
    });
    expect(invalidConsent.statusCode).toBe(400);
    expect(photos.upload).not.toHaveBeenCalled();
    const boundary = "selfx-profile-fixture";
    const payload = Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="fixture.png"\r\nContent-Type: image/png\r\n\r\nfixture-bytes\r\n--${boundary}--\r\n`,
    );
    photos.upload.mockResolvedValue({ photo: { id } });
    const upload = await app.inject({
      method: "POST",
      url: "/api/v1/customer/me/photo?consentVersion=2026-10-27&consentLanguage=te",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(upload.statusCode).toBe(201);
    expect(photos.upload).toHaveBeenCalledWith(
      customer,
      Buffer.from("fixture-bytes"),
      "image/png",
      "te",
      "2026-10-27",
    );
    const persistentUpload = await app.inject({
      method: "POST",
      url: "/api/v1/customer/me/photo?consentVersion=2026-10-27-v2&consentLanguage=te",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    expect(persistentUpload.statusCode).toBe(201);
    expect(photos.upload).toHaveBeenLastCalledWith(
      customer,
      Buffer.from("fixture-bytes"),
      "image/png",
      "te",
      "2026-10-27-v2",
    );
    photos.remove.mockResolvedValue({ photo: null });
    await app.inject({ method: "DELETE", url: "/api/v1/customer/me/photo" });
    expect(photos.remove).toHaveBeenCalledWith(customer);
    auth.requireCustomer.mockRejectedValue(
      new ApiErrorException(401, "CUSTOMER_UNAUTHORIZED", "Sign in"),
    );
    photos.get.mockClear();
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/customer/me/photo" }))
        .statusCode,
    ).toBe(401);
    expect(photos.get).not.toHaveBeenCalled();
  });
  it("requires customer identity before any sensitive reads and never caches the balance", async () => {
    const ok = await app.inject({
      method: "GET",
      url: "/api/v1/customer/experience",
      headers: { authorization: "Bearer customer" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(experience.summary).toHaveBeenCalledWith(customer);
    auth.requireCustomer.mockRejectedValue(
      new ApiErrorException(401, "CUSTOMER_UNAUTHORIZED", "Sign in"),
    );
    experience.getAsset.mockClear();
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/customer/try-on/assets/${randomUUID()}`,
        })
      ).statusCode,
    ).toBe(401);
    expect(experience.getAsset).not.toHaveBeenCalled();
  });
  it("rejects client-controlled payer, Store IDs and technical provider controls", async () => {
    const body = {
      sessionId: randomUUID(),
      clientRequestId: randomUUID(),
      personAssetId: randomUUID(),
      garmentAssetId: randomUUID(),
    };
    for (const extra of [
      { payer: "STORE" },
      { organizationId: storeId },
      { provider: "fashn" },
      { generationProfile: "QUALITY" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/customer/try-on/runs",
        payload: { ...body, ...extra },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(experience.createRun).not.toHaveBeenCalled();
  });
  it("validates consent/session IDs and limits expensive endpoints per customer", async () => {
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/customer/try-on/sessions",
      payload: {
        consentAccepted: "yes",
        consentVersion: "test",
        storeVisitId: "not-a-uuid",
      },
    });
    expect(bad.statusCode).toBe(400);
    expect(experience.createSession).not.toHaveBeenCalled();
    const body = { consentAccepted: true, consentVersion: "test" };
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/customer/try-on/sessions",
          payload: body,
        })
      ).statusCode,
    ).toBe(201);
    expect(auth.limitExperience).toHaveBeenCalledWith(
      "session",
      customer.id,
      expect.any(String),
    );
  });
  it("rejects JSON pretending to be a photo and authorizes upload first", async () => {
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/customer/try-on/sessions/${randomUUID()}/photos/PERSON`,
          payload: { image: "not-a-file" },
        })
      ).statusCode,
    ).toBe(400);
    expect(experience.upload).not.toHaveBeenCalled();
    expect(auth.requireCustomer).toHaveBeenCalled();
  });
  it("does not expose customer photos through staff QR routes without Store resource permission", async () => {
    rbac.requireStoreResourcePermission.mockRejectedValue(
      new ApiErrorException(
        403,
        "STORE_PERMISSION_DENIED",
        "Permission denied",
      ),
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: `/api/v1/admin/stores/${storeId}/mobile-qrs`,
        })
      ).statusCode,
    ).toBe(403);
    expect(experience.listQrs).not.toHaveBeenCalled();
    expect(rbac.requireStoreResourcePermission).toHaveBeenCalledWith(
      "staff-actor",
      storeId,
      "integrations.view",
    );
  });
  it("requires management authority and attributes QR creation to the actual staff user", async () => {
    const body = { label: "Counter", dailyCustomerLimit: 5 };
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/admin/stores/${storeId}/mobile-qrs`,
          payload: body,
        })
      ).statusCode,
    ).toBe(201);
    expect(experience.createQr).toHaveBeenCalledWith(
      storeId,
      "staff-actor",
      "Counter",
      5,
    );
    expect(rbac.requireStoreResourcePermission).toHaveBeenCalledWith(
      "staff-actor",
      storeId,
      "integrations.manage",
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/admin/stores/${storeId}/mobile-qrs`,
          payload: { ...body, dailyCustomerLimit: 101 },
        })
      ).statusCode,
    ).toBe(400);
  });
});
