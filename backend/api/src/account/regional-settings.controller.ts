import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";

export class RegionalSettingsDto {
  @IsOptional() @IsString() @MaxLength(64) timezone?: string | null;
  @IsIn(["AUTO", "DMY", "MDY", "YMD"]) dateFormat!: string;
  @IsIn(["AUTO", "H12", "H24"]) timeFormat!: string;
}

export function validateTimezone(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
  } catch {
    throw new ApiErrorException(
      400,
      "REGIONAL_TIMEZONE_INVALID",
      "Choose a valid time zone.",
    );
  }
  return value;
}

@Controller("api/v1/account/regional-settings")
export class RegionalSettingsController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}
  @Get()
  async get(@Req() request: FastifyRequest) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const preferences = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        regionalTimezone: true,
        regionalDateFormat: true,
        regionalTimeFormat: true,
      },
    });
    return {
      timezone: preferences.regionalTimezone,
      dateFormat: preferences.regionalDateFormat,
      timeFormat: preferences.regionalTimeFormat,
    };
  }
  @Patch()
  async save(
    @Req() request: FastifyRequest,
    @Body() input: RegionalSettingsDto,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const timezone = validateTimezone(input.timezone);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        regionalTimezone: timezone,
        regionalDateFormat: input.dateFormat,
        regionalTimeFormat: input.timeFormat,
      },
    });
    return {
      timezone,
      dateFormat: input.dateFormat,
      timeFormat: input.timeFormat,
    };
  }
}
