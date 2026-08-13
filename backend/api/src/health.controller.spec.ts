import { HttpException, HttpStatus } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaService } from "./database/prisma.service.js";
import { HealthController } from "./health.controller.js";

describe("HealthController", () => {
  let queryRaw: ReturnType<typeof vi.fn>;
  let controller: HealthController;

  beforeEach(() => {
    queryRaw = vi.fn();
    controller = new HealthController({
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  });

  it("keeps /health as database-independent liveness", () => {
    expect(controller.health()).toEqual({
      service: "selfx-api",
      status: "ok",
    });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("returns ready when the PostgreSQL probe succeeds", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    await expect(controller.ready()).resolves.toEqual({
      service: "selfx-api",
      status: "ready",
      database: "ok",
    });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("returns sanitized 503 readiness failure when the PostgreSQL probe fails", async () => {
    queryRaw.mockRejectedValue(
      new Error("postgres://user:password@db.internal/selfx is down"),
    );

    try {
      await controller.ready();
      throw new Error("Expected readiness failure");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      const exception = error as HttpException;
      expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      expect(exception.getResponse()).toEqual({
        service: "selfx-api",
        status: "not_ready",
        database: "unavailable",
      });
      expect(JSON.stringify(exception.getResponse())).not.toContain(
        "password",
      );
      expect(JSON.stringify(exception.getResponse())).not.toContain(
        "db.internal",
      );
    }
  });
});
