import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { createSelfxId } from "@selfx/database";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AuthService } from "../auth/auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { CustomerAuthService } from "../customers/customer-auth.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import {
  PLATFORM_PERMISSIONS,
  permissionsForPlatformRole,
  platformPermissionsWithViewImplied,
} from "../platform/platform-permissions.js";
import {
  AdminContentReportsController,
  CustomerContentReportsController,
} from "./content-reports.controller.js";
import { ContentReportsService } from "./content-reports.service.js";

describe("Content report HTTP authorization and validation", () => {
  let app: NestFastifyApplication;
  const id = createSelfxId(),
    customerId = createSelfxId();
  const reports = {
    submit: vi.fn(),
    list: vi.fn(),
    detail: vi.fn(),
    image: vi.fn(),
    review: vi.fn(),
  };
  const customerAuth = { requireCustomer: vi.fn(), limitExperience: vi.fn() };
  const staffAuth = { requireAccessUser: vi.fn() };
  const platform = { requirePermission: vi.fn() };
  beforeAll(async () => {
    @Module({
      controllers: [
        CustomerContentReportsController,
        AdminContentReportsController,
      ],
      providers: [
        { provide: CustomerAuthService, useValue: customerAuth },
        { provide: AuthService, useValue: staffAuth },
        { provide: PlatformAuthorizationService, useValue: platform },
        { provide: ContentReportsService, useValue: reports },
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
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  beforeEach(() => {
    vi.resetAllMocks();
    customerAuth.requireCustomer.mockImplementation(async (header) => {
      if (header !== "Bearer customer")
        throw new ApiErrorException(401, "CUSTOMER_UNAUTHORIZED", "Sign in.");
      return { customer: { id: customerId, securityVersion: 1 } };
    });
    staffAuth.requireAccessUser.mockImplementation(async (header) => {
      if (!header || header === "Bearer customer")
        throw new ApiErrorException(401, "AUTH_UNAUTHORIZED", "Sign in.");
      return { id: header.slice(7) };
    });
    platform.requirePermission.mockImplementation(async (actor, permission) => {
      if (
        actor === "store" ||
        (actor === "viewer" &&
          permission !== PLATFORM_PERMISSIONS.contentReportsView)
      )
        throw new ApiErrorException(
          403,
          "PLATFORM_PERMISSION_DENIED",
          "Denied.",
        );
    });
    reports.submit.mockResolvedValue({ id, submitted: true });
    reports.list.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      pageSize: 25,
    });
    reports.image.mockResolvedValue({
      body: Buffer.from("synthetic-result"),
      contentType: "image/png",
    });
  });
  afterAll(async () => {
    await app.close();
  });
  it("submits using customer identity and applies rate limits before persistence", async () => {
    const input = {
      resultAssetId: createSelfxId(),
      reason: "OTHER",
      comment: "Synthetic comment",
    };
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/customer/content-reports",
      headers: { authorization: "Bearer customer" },
      payload: input,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(reports.submit).toHaveBeenCalledWith(
      { id: customerId, securityVersion: 1 },
      input,
    );
    expect(customerAuth.limitExperience).toHaveBeenCalledWith(
      "report",
      customerId,
      expect.any(String),
    );
    customerAuth.limitExperience.mockRejectedValue(
      new ApiErrorException(429, "CUSTOMER_RATE_LIMITED", "Try later."),
    );
    reports.submit.mockClear();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/customer/content-reports",
          headers: { authorization: "Bearer customer" },
          payload: input,
        })
      ).statusCode,
    ).toBe(429);
    expect(reports.submit).not.toHaveBeenCalled();
  });
  it("rejects invalid reasons, excessive text, invalid IDs and injected ownership", async () => {
    const input = { resultAssetId: createSelfxId(), reason: "OTHER" };
    for (const changes of [
      { resultAssetId: "bad" },
      { reason: "INVALID" },
      { comment: "x".repeat(2001) },
      { comment: null },
      { customerId: createSelfxId() },
      { runId: createSelfxId() },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/customer/content-reports",
        headers: { authorization: "Bearer customer" },
        payload: { ...input, ...changes },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(reports.submit).not.toHaveBeenCalled();
  });
  it("rejects anonymous/staff submissions and customer access to platform reports", async () => {
    for (const authorization of [undefined, "Bearer store"]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/customer/content-reports",
            headers: authorization ? { authorization } : {},
            payload: { resultAssetId: id, reason: "OTHER" },
          })
        ).statusCode,
      ).toBe(401);
    }
    expect(
      (
        await app.inject({
          url: "/api/v1/admin/content-reports",
          headers: { authorization: "Bearer customer" },
        })
      ).statusCode,
    ).toBe(401);
    expect(reports.submit).not.toHaveBeenCalled();
    expect(reports.list).not.toHaveBeenCalled();
  });
  it("guards every admin operation before accessing reports or images", async () => {
    for (const [method, suffix, payload] of [
      ["GET", "", undefined],
      ["GET", `/${id}`, undefined],
      ["GET", `/${id}/image`, undefined],
      ["PATCH", `/${id}`, { status: "RESOLVED", version: 1 }],
    ] as const) {
      const response = await app.inject({
        method,
        url: `/api/v1/admin/content-reports${suffix}`,
        headers: { authorization: "Bearer store" },
        ...(payload ? { payload } : {}),
      });
      expect(response.statusCode).toBe(403);
    }
    for (const method of [
      reports.list,
      reports.detail,
      reports.image,
      reports.review,
    ])
      expect(method).not.toHaveBeenCalled();
  });
  it("allows a viewer to read private images but prevents review changes", async () => {
    const response = await app.inject({
      url: `/api/v1/admin/content-reports/${id}/image`,
      headers: { authorization: "Bearer viewer" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("synthetic-result");
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/admin/content-reports/${id}`,
          headers: { authorization: "Bearer viewer" },
          payload: { status: "RESOLVED", version: 1 },
        })
      ).statusCode,
    ).toBe(403);
    expect(reports.review).not.toHaveBeenCalled();
  });
  it("paginates and allowlists filters, validates reviews and attributes the actor", async () => {
    expect(
      (
        await app.inject({
          url: "/api/v1/admin/content-reports?page=2&pageSize=10&status=NEW&reason=OTHER",
          headers: { authorization: "Bearer manager" },
        })
      ).statusCode,
    ).toBe(200);
    expect(reports.list).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 10,
        status: "NEW",
        reason: "OTHER",
      }),
    );
    for (const query of [
      "pageSize=101",
      "page=0",
      "status=BAD",
      "reason=BAD",
      "sort=comment",
    ])
      expect(
        (
          await app.inject({
            url: `/api/v1/admin/content-reports?${query}`,
            headers: { authorization: "Bearer manager" },
          })
        ).statusCode,
      ).toBe(400);
    for (const payload of [
      { status: "BAD", version: 1 },
      { status: "RESOLVED" },
      { status: "RESOLVED", version: 1, reviewNotes: "x".repeat(4001) },
      { status: "RESOLVED", version: 1, reviewNotes: null },
    ])
      expect(
        (
          await app.inject({
            method: "PATCH",
            url: `/api/v1/admin/content-reports/${id}`,
            headers: { authorization: "Bearer manager" },
            payload,
          })
        ).statusCode,
      ).toBe(400);
    const payload = { status: "RESOLVED", version: 1, reviewNotes: "Reviewed" };
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/admin/content-reports/${id}`,
          headers: { authorization: "Bearer manager" },
          payload,
        })
      ).statusCode,
    ).toBe(200);
    expect(reports.review).toHaveBeenCalledWith(id, "manager", payload);
  });
  it("denies content report access during Store impersonation", async () => {
    const authorization = new PlatformAuthorizationService({
      impersonationSession: {
        findFirst: vi.fn().mockResolvedValue({ id: createSelfxId() }),
      },
    } as unknown as PrismaService);
    for (const permission of [
      PLATFORM_PERMISSIONS.contentReportsView,
      PLATFORM_PERMISSIONS.contentReportsManage,
    ])
      await expect(
        authorization.requirePermission("platform-actor", permission),
      ).rejects.toMatchObject({ status: 403 });
  });
  it("grants reports only to Superadmin by default and implies view from manage", () => {
    expect(permissionsForPlatformRole("SELFX_SUPER_ADMIN")).toContain(
      "CONTENT_REPORTS_MANAGE",
    );
    for (const role of ["SELFX_STAFF_ADMIN", "SELFX_SUPPORT_ADMIN"] as const) {
      expect(permissionsForPlatformRole(role)).not.toContain(
        "CONTENT_REPORTS_VIEW",
      );
      expect(permissionsForPlatformRole(role)).not.toContain(
        "CONTENT_REPORTS_MANAGE",
      );
    }
    expect(
      platformPermissionsWithViewImplied(["CONTENT_REPORTS_MANAGE"]),
    ).toContain("CONTENT_REPORTS_VIEW");
  });
});
