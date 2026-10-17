import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { MailSettingsService } from "./mail-settings.service.js";
import { SaveMailSettingsDto, SendTestEmailDto } from "./mail.dto.js";

@ApiTags("Platform Mail Settings")
@ApiBearerAuth()
@Controller("api/v1/admin/platform-settings/mail")
export class MailSettingsController {
  constructor(
    private readonly auth: AuthService,
    private readonly authorization: PlatformAuthorizationService,
    private readonly settings: MailSettingsService,
  ) {}
  private async requireSuperadmin(request: FastifyRequest) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if (!(await this.authorization.isSuperadmin(user.id)))
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "PLATFORM_PERMISSION_DENIED",
        "Only SelfX Superadmins can access Mail Settings.",
      );
    return user;
  }
  @Get() async get(@Req() request: FastifyRequest) {
    await this.requireSuperadmin(request);
    return this.settings.get();
  }
  @Put() async save(
    @Req() request: FastifyRequest,
    @Body() input: SaveMailSettingsDto,
  ) {
    const user = await this.requireSuperadmin(request);
    return this.settings.save(user.id, input);
  }
  @Post("test") async test(
    @Req() request: FastifyRequest,
    @Body() input: SendTestEmailDto,
  ) {
    const user = await this.requireSuperadmin(request);
    return this.settings.test(user.id, input.recipient, input.version);
  }
}
