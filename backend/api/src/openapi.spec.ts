import "reflect-metadata";

import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AppModule } from "./app.module.js";
import { setupOpenApiDocs } from "./openapi.js";

describe("OpenAPI documentation", () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
      { logger: false, abortOnError: false },
    );
    setupOpenApiDocs(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("exposes a Public API-only machine-readable OpenAPI document", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/public/openapi.json")
      .expect(200);

    expect(response.body.info.title).toBe("SelfX Public API");
    expect(response.body.components.securitySchemes.SelfXApiKey).toMatchObject({
      type: "apiKey",
      in: "header",
      name: "x-selfx-api-key",
    });
    expect(response.body.security).toEqual([{ SelfXApiKey: [] }]);

    const paths = Object.keys(response.body.paths);
    expect(paths).toContain("/api/v1/public/try-ons");
    expect(paths).toContain("/api/v1/public/try-ons/{runId}");
    expect(paths).toContain("/api/v1/public/try-ons/{runId}/download");
    expect(paths).toContain("/api/v1/public/usage");
    expect(paths.every((path) => path.startsWith("/api/v1/public"))).toBe(true);
    expect(paths).not.toContain("/api/v1/developer/api-keys");
    expect(paths.some((path) => path.includes("payments"))).toBe(false);

    const schemaNames = Object.keys(response.body.components.schemas ?? {});
    expect(schemaNames).toContain("CreatePublicApiTryOnDto");
    expect(schemaNames).toContain("PublicApiUsageResponseDto");
    expect(schemaNames.some((name) => name.startsWith("DeveloperApi"))).toBe(
      false,
    );
  });
  it("registers Store payment verification only in the internal API", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/docs-json")
      .expect(200);
    const paths = Object.keys(response.body.paths);
    expect(paths).toContain(
      "/api/v1/admin/stores/{storeId}/payments/phonepe/testing",
    );
    expect(paths).toContain(
      "/api/v1/admin/stores/{storeId}/payments/phonepe/testing/tests/{testId}/check",
    );
    expect(paths).toContain(
      "/api/v1/payments/phonepe/stores/{storeId}/tests/{testId}/callback",
    );
    const anonymous = await request(app.getHttpServer()).get(
      "/api/v1/admin/stores/0199aee0-0000-7000-8000-000000000001/payments/phonepe/testing",
    );
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers["cache-control"]).toBe("private, no-store");
  });
  it("registers the unified Roles workspace behind staff authentication", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/docs-json")
      .expect(200);
    expect(Object.keys(response.body.paths)).toEqual(
      expect.arrayContaining([
        "/api/v1/admin/roles",
        "/api/v1/admin/roles/stores/{storeId}",
      ]),
    );
    await request(app.getHttpServer()).get("/api/v1/admin/roles").expect(401);
    await request(app.getHttpServer())
      .get("/api/v1/admin/roles/stores/0199aee0-0000-7000-8000-000000000001")
      .expect(401);
  });
});
