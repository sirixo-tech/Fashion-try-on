import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { type FastifyReply, type FastifyRequest } from "fastify";

import { AUTH_CONFIG } from "./auth.constants.js";
import { type AuthConfig } from "./auth.config.js";
import { AuthService } from "./auth.service.js";
import { BrowserSecurityService } from "./browser-security.service.js";
import {
  ApiErrorResponseDto,
  AuthTokenResponseDto,
  LogoutAllResponseDto,
  LogoutResponseDto,
  MeResponseDto,
} from "./dto/auth-response.dto.js";
import { LoginDto } from "./dto/login.dto.js";

@ApiTags("Staff/Admin Auth")
@Controller("api/v1/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly browserSecurity: BrowserSecurityService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Staff/admin email-password login" })
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 429, type: ApiErrorResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthTokenResponseDto> {
    this.browserSecurity.assertTrustedOrigin(request);
    const result = await this.auth.login(dto.email, dto.password, {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      origin: request.headers.origin,
    });
    this.setRefreshCookie(
      reply,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      user: result.user,
    };
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Rotate refresh session and issue a new access token",
  })
  @ApiOkResponse({ type: AuthTokenResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  @ApiResponse({ status: 429, type: ApiErrorResponseDto })
  async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<AuthTokenResponseDto> {
    this.browserSecurity.assertTrustedOrigin(request);
    const result = await this.auth.refresh(this.getRefreshCookie(request), {
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"],
      origin: request.headers.origin,
    });
    this.setRefreshCookie(
      reply,
      result.refreshToken,
      result.refreshTokenExpiresAt,
    );
    return {
      accessToken: result.accessToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      user: result.user,
    };
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Revoke the current refresh session" })
  @ApiOkResponse({ type: LogoutResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LogoutResponseDto> {
    this.browserSecurity.assertTrustedOrigin(request);
    await this.auth.logout(this.getRefreshCookie(request));
    this.clearRefreshCookie(reply);
    return { ok: true };
  }

  @Post("logout-all")
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Revoke all active staff/admin sessions for the user",
  })
  @ApiOkResponse({ type: LogoutAllResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async logoutAll(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LogoutAllResponseDto> {
    this.browserSecurity.assertTrustedOrigin(request);
    const result = await this.auth.logoutAll(request.headers.authorization);
    this.clearRefreshCookie(reply);
    return { ok: true, revokedSessions: result.revokedSessions };
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Return the current staff/admin user" })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  async me(@Req() request: FastifyRequest): Promise<MeResponseDto> {
    return { user: await this.auth.me(request.headers.authorization) };
  }

  private getRefreshCookie(request: FastifyRequest): string | undefined {
    return (request.cookies as Record<string, string> | undefined)?.[
      this.config.refreshCookieName
    ];
  }

  private setRefreshCookie(
    reply: FastifyReply,
    token: string,
    expiresAt: Date,
  ): void {
    reply.setCookie(this.config.refreshCookieName, token, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: this.config.cookieSameSite,
      domain: this.config.cookieDomain,
      path: "/api/v1/auth",
      expires: expiresAt,
    });
  }

  private clearRefreshCookie(reply: FastifyReply): void {
    reply.clearCookie(this.config.refreshCookieName, {
      domain: this.config.cookieDomain,
      path: "/api/v1/auth",
    });
  }
}
