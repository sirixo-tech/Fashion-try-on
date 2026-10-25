import "reflect-metadata";
import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
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
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { CustomerMetricsController } from "./customer-metrics.controller.js";
import { CustomerMetricsService } from "./customer-metrics.service.js";
import { PrismaService } from "../database/prisma.service.js";

describe("Mobile metrics platform boundary", () => {
  let app: NestFastifyApplication;
  const auth = { requireAccessUser: vi.fn() },
    platform = { requirePermission: vi.fn() },
    metrics = { summary: vi.fn() };
  beforeAll(async () => {
    @Module({
      controllers: [CustomerMetricsController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PlatformAuthorizationService, useValue: platform },
        { provide: CustomerMetricsService, useValue: metrics },
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
  }, 60000);
  beforeEach(() => {
    vi.resetAllMocks();
    auth.requireAccessUser.mockResolvedValue({ id: "staff-user" });
    platform.requirePermission.mockResolvedValue(undefined);
    metrics.summary.mockResolvedValue({
      available: true,
      totals: { total: 2 },
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  it("requires staff identity and platform USAGE_VIEW before querying any customer data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/admin/mobile-dashboard/summary?range=7d",
      headers: { authorization: "Bearer staff" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(auth.requireAccessUser).toHaveBeenCalledWith("Bearer staff");
    expect(platform.requirePermission).toHaveBeenCalledWith(
      "staff-user",
      "USAGE_VIEW",
    );
    expect(metrics.summary).toHaveBeenCalledWith(
      expect.objectContaining({ range: "7d" }),
    );
  });
  it("denies Store users even when they have merchant analytics permission", async () => {
    platform.requirePermission.mockRejectedValue(
      new ApiErrorException(
        403,
        "PLATFORM_PERMISSION_DENIED",
        "Permission denied",
      ),
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/admin/mobile-dashboard/summary",
        })
      ).statusCode,
    ).toBe(403);
    expect(metrics.summary).not.toHaveBeenCalled();
  });
  it("denies customer JWTs and unauthenticated callers before platform access", async () => {
    auth.requireAccessUser.mockRejectedValue(
      new ApiErrorException(401, "AUTH_UNAUTHORIZED", "Sign in"),
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/v1/admin/mobile-dashboard/summary",
          headers: { authorization: "Bearer customer-jwt" },
        })
      ).statusCode,
    ).toBe(401);
    expect(platform.requirePermission).not.toHaveBeenCalled();
    expect(metrics.summary).not.toHaveBeenCalled();
  });
  it("rejects custom dates, invalid ranges and Store/customer filters", async () => {
    for (const query of [
      "range=365d",
      "range=custom",
      "storeId=another-store",
      "customerId=private",
      "from=2020-01-01",
    ]) {
      expect(
        (
          await app.inject({
            method: "GET",
            url: `/api/v1/admin/mobile-dashboard/summary?${query}`,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(metrics.summary).not.toHaveBeenCalled();
  });
  it("does not access unmigrated customer tables while customer accounts are disabled", async () => {
    vi.stubEnv("SELFX_CUSTOMER_AUTH_ENABLED", "false");
    try {
      const db = { $transaction: vi.fn() };
      const result = await new CustomerMetricsService(
        db as unknown as PrismaService,
      ).summary({ range: "30d" });
      expect(result).toMatchObject({
        available: false,
        totals: null,
        daily: [],
        methods: [],
      });
      expect(db.$transaction).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
