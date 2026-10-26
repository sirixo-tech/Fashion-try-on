import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { beforeAll, beforeEach, afterAll, it, expect, vi } from "vitest";
import { createSelfxId } from "@selfx/database";
import {
  CustomerAppController,
  CustomerNotificationsController,
} from "./customer-app.controller.js";
import { CustomerNotificationsService } from "./customer-notifications.service.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { AppReleasesService } from "../apps/app-releases.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
const notifications = {
    ready: () => false,
    list: vi.fn(),
    read: vi.fn(),
    register: vi.fn(),
    unregister: vi.fn(),
  },
  auth = { requireCustomer: vi.fn(), limitExperience: vi.fn() },
  releases = { customerUpdate: vi.fn(), download: vi.fn() };
let app: NestFastifyApplication;
beforeAll(async () => {
  vi.stubEnv("SELFX_CUSTOMER_PUBLIC_WEB_URL", "https://selfx.test");
  @Module({
    controllers: [CustomerAppController, CustomerNotificationsController],
    providers: [
      { provide: CustomerNotificationsService, useValue: notifications },
      { provide: CustomerAuthService, useValue: auth },
      { provide: AppReleasesService, useValue: releases },
    ],
  })
  class TestModule {}
  app = await NestFactory.create<NestFastifyApplication>(
    TestModule,
    new FastifyAdapter(),
    { logger: false, abortOnError: false },
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
});
beforeEach(() => {
  vi.clearAllMocks();
  auth.requireCustomer.mockResolvedValue({
    customer: { id: "customer-a" },
    sessionId: "session-a",
  });
  notifications.list.mockResolvedValue({ data: [] });
  releases.customerUpdate.mockResolvedValue({ update: null });
});
afterAll(async () => {
  await app.close();
  vi.unstubAllEnvs();
});
it("exposes safe public links and update checks without requiring account creation", async () => {
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/customer/app/config",
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toMatchObject({
    termsUrl: "https://selfx.test/terms",
    privacyUrl: "https://selfx.test/privacy",
    pushAvailable: false,
  });
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(auth.requireCustomer).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/customer/app/updates?versionCode=3&architecture=ARM64&sdk=35",
      })
    ).statusCode,
  ).toBe(200);
  expect(releases.customerUpdate).toHaveBeenCalledWith(3, "ARM64", 35);
  expect(
    (
      await app.inject({
        method: "GET",
        url: "/api/v1/customer/app/updates?versionCode=-1&architecture=other&sdk=1",
      })
    ).statusCode,
  ).toBe(400);
});
it("scopes public downloads to published customer releases", async () => {
  const id = createSelfxId();
  releases.download.mockResolvedValue({ url: "https://private.invalid/apk" });
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/api/v1/customer/app/releases/${id}/download`,
      })
    ).statusCode,
  ).toBe(201);
  expect(releases.download).toHaveBeenCalledWith(id, true, "CUSTOMER");
});
it("authenticates inbox and registration before accessing account data", async () => {
  auth.requireCustomer.mockRejectedValue(
    new ApiErrorException(401, "CUSTOMER_UNAUTHORIZED", "Sign in"),
  );
  expect(
    (await app.inject({ method: "GET", url: "/api/v1/customer/notifications" }))
      .statusCode,
  ).toBe(401);
  expect(notifications.list).not.toHaveBeenCalled();
});
it("does not accept client-controlled ownership or payload content in device registration", async () => {
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/api/v1/customer/push-devices",
        payload: {
          installationId: createSelfxId(),
          token: "a".repeat(22),
          platform: "ANDROID",
          customerId: "other",
        },
      })
    ).statusCode,
  ).toBe(400);
  expect(notifications.register).not.toHaveBeenCalled();
});
