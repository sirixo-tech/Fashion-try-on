import { Controller, Get, HttpException, HttpStatus } from "@nestjs/common";

import { PrismaService } from "./database/prisma.service.js";

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("health")
  health() {
    return {
      service: "selfx-api",
      status: "ok",
    };
  }

  @Get("ready")
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new HttpException(
        {
          service: "selfx-api",
          status: "not_ready",
          database: "unavailable",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      service: "selfx-api",
      status: "ready",
      database: "ok",
    };
  }
}
