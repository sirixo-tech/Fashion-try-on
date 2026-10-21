import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import multipart from "@fastify/multipart";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { AppReleasesController } from "./app-releases.controller.js";
import { AppReleasesService } from "./app-releases.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { AuthService } from "../auth/auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
const auth = { requireAccessUser: vi.fn() },
  platform = { hasPermission: vi.fn(), requirePermission: vi.fn() },
  service = {
    upload: vi.fn(),
    beginUpload: vi.fn(),
    endUpload: vi.fn(),
    change: vi.fn(),
  };
@Module({
  controllers: [AppReleasesController],
  providers: [
    { provide: AuthService, useValue: auth },
    { provide: PlatformAuthorizationService, useValue: platform },
    { provide: AppReleasesService, useValue: service },
  ],
})
class FixtureModule {}
let app: NestFastifyApplication;
beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(
    FixtureModule,
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
});
afterAll(async () => {
  await app?.close();
});
beforeEach(() => {
  vi.resetAllMocks();
  auth.requireAccessUser.mockResolvedValue({ id: "fixture-user" });
  service.upload.mockResolvedValue({ id: "fixture-release", status: "DRAFT" });
});
it("receives binary APK and notes through Fastify multipart", async () => {
  const response = await request(app.getHttpServer())
    .post("/api/v1/platform/app-releases")
    .field("releaseNotes", "Test release")
    .attach("apk", Buffer.from("PK\x03\x04fixture"), {
      filename: "release.apk",
      contentType: "application/vnd.android.package-archive",
    });
  expect(response.status).toBe(201);
  expect(service.upload).toHaveBeenCalledWith(
    "fixture-user",
    expect.any(Buffer),
    "Test release",
  );
  expect(service.endUpload).toHaveBeenCalledWith("fixture-user");
});
it("denies release upload without management authority", async () => {
  platform.requirePermission.mockRejectedValue(
    new ApiErrorException(403, "PLATFORM_PERMISSION_DENIED", "Denied"),
  );
  const response = await request(app.getHttpServer())
    .post("/api/v1/platform/app-releases")
    .attach("apk", Buffer.from("PK\x03\x04fixture"), {
      filename: "release.apk",
    });
  expect(response.status).toBe(403);
  expect(service.upload).not.toHaveBeenCalled();
});
it("rejects wrong upload types and releases the concurrency slot", async () => {
  const response = await request(app.getHttpServer())
    .post("/api/v1/platform/app-releases")
    .attach("apk", Buffer.from("invalid"), {
      filename: "app.txt",
      contentType: "text/plain",
    });
  expect(response.status).toBe(400);
  expect(service.upload).not.toHaveBeenCalled();
  expect(service.endUpload).toHaveBeenCalled();
});
it("rejects extra JSON lifecycle fields", async () => {
  const response = await request(app.getHttpServer())
    .post(
      "/api/v1/platform/app-releases/019a0d39-0000-7000-8000-000000000001/action",
    )
    .send({ action: "publish", revision: 0, userId: "someone-else" });
  expect(response.status).toBe(400);
  expect(service.change).not.toHaveBeenCalled();
});
