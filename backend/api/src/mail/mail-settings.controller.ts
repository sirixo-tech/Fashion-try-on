import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  Put,
  Param,
  Header,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { MailSettingsService } from "./mail-settings.service.js";
import {
  SaveMailSettingsDto,
  SaveMailTemplateDto,
  SendCustomEmailDto,
} from "./mail.dto.js";
import { MailAutomationService } from "./mail-automation.service.js";

@ApiTags("Platform Mail Settings")
@ApiBearerAuth()
@Controller("api/v1/admin/platform-settings/mail")
export class MailSettingsController {
  constructor(
    private readonly auth: AuthService,
    private readonly authorization: PlatformAuthorizationService,
    private readonly settings: MailSettingsService,
    private readonly automation: MailAutomationService,
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
    await this.automation.assertNoImpersonation(user.id);
    return user;
  }
  @Get() @Header("Cache-Control", "private, no-store") async get(
    @Req() request: FastifyRequest,
  ) {
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
  @Get("templates")
  @Header("Cache-Control", "private, no-store")
  async templates(@Req() request: FastifyRequest) {
    await this.requireSuperadmin(request);
    return this.automation.templates();
  }
  @Put("templates/:code") async saveTemplate(
    @Req() request: FastifyRequest,
    @Param("code") code: string,
    @Body() input: SaveMailTemplateDto,
  ) {
    const user = await this.requireSuperadmin(request);
    return this.automation.saveTemplate(user.id, code, input);
  }
  @Get("history") @Header("Cache-Control", "private, no-store") async history(
    @Req() request: FastifyRequest,
  ) {
    await this.requireSuperadmin(request);
    return this.automation.history();
  }
  @Post("custom") async custom(
    @Req() request: FastifyRequest,
    @Body() input: SendCustomEmailDto,
  ) {
    const user = await this.requireSuperadmin(request);
    return this.automation.custom(user.id, input);
  }
}
