import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  IsEmail,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { type FastifyReply, type FastifyRequest } from "fastify";
import { BrowserSecurityService } from "./browser-security.service.js";
import { PasswordRecoveryService } from "./password-recovery.service.js";

export class ForgotPasswordDto {
  @IsEmail() @MaxLength(320) email!: string;
}
export class ResetPasswordDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) token!: string;
  @IsString() @MinLength(12) @MaxLength(256) password!: string;
}
@Controller("api/v1/auth")
export class PasswordRecoveryController {
  constructor(
    private readonly recovery: PasswordRecoveryService,
    private readonly browser: BrowserSecurityService,
  ) {}
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  async forgot(
    @Req() request: FastifyRequest,
    @Body() input: ForgotPasswordDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.browser.assertTrustedOrigin(request);
    reply.header("Cache-Control", "no-store");
    return this.recovery.request(input.email, request.ip);
  }
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  async reset(
    @Req() request: FastifyRequest,
    @Body() input: ResetPasswordDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.browser.assertTrustedOrigin(request);
    reply.header("Cache-Control", "no-store");
    return this.recovery.reset(input.token, input.password, request.ip);
  }
}
