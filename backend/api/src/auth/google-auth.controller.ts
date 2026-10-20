import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { FastifyReply, FastifyRequest } from "fastify";
import { AUTH_CONFIG } from "./auth.constants.js";
import type { AuthConfig } from "./auth.config.js";
import { AuthService } from "./auth.service.js";
import { BrowserSecurityService } from "./browser-security.service.js";
import { GoogleAuthService } from "./google-auth.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";

const browserCookie = "selfx_google_browser",
  linkCookie = "selfx_google_link";
export class StartGoogleDto {
  @ApiProperty({ enum: ["login", "signup"] }) @IsIn(["login", "signup"]) mode!:
    "login" | "signup";
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  next?: string;
}
export class LinkGoogleDto {
  @ApiProperty() @IsString() @MaxLength(256) password!: string;
}
export class GoogleConfigResponse {
  @ApiProperty() enabled!: boolean;
}
export class GoogleStartResponse {
  @ApiProperty() authorizationUrl!: string;
}
export class GoogleLinkResponse {
  @ApiProperty() ok!: boolean;
}

@ApiTags("SelfX Auth")
@Controller("api/v1/auth/google")
export class GoogleAuthController {
  constructor(
    private readonly google: GoogleAuthService,
    private readonly auth: AuthService,
    private readonly security: BrowserSecurityService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}
  @Get("config")
  @ApiOperation({ summary: "Google sign-in availability" })
  @ApiOkResponse({ type: GoogleConfigResponse })
  availability(@Res({ passthrough: true }) reply: FastifyReply) {
    reply.header("Cache-Control", "no-store");
    return { enabled: !!this.google.config };
  }
  @Post("start")
  @HttpCode(200)
  @ApiOperation({ summary: "Start Google sign-in or Store signup" })
  @ApiOkResponse({ type: GoogleStartResponse })
  async start(
    @Body() dto: StartGoogleDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.security.assertTrustedOrigin(request);
    const result = await this.google.start(dto.mode, dto.next, request.ip);
    this.cookie(reply, browserCookie, result.browser);
    this.clear(reply, linkCookie);
    reply.header("Cache-Control", "no-store");
    return { authorizationUrl: result.authorizationUrl };
  }
  @Get("callback")
  @ApiOperation({ summary: "Registered Google authorization callback" })
  async callback(
    @Query() query: Record<string, unknown>,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const web = this.google.config?.webOrigin;
    // The feature is hidden when disabled; no request-provided redirect is trusted.
    if (!web)
      return reply.code(404).send({
        error: {
          code: "AUTH_GOOGLE_UNAVAILABLE",
          message: "Google sign-in is unavailable.",
        },
      });
    reply
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer");
    this.clear(reply, browserCookie);
    try {
      const result = await this.google.finish(
        googleCallbackInput(query),
        request.cookies[browserCookie],
        metadata(request),
      );
      if (result.reason)
        return reply.redirect(
          `${web}/login?google=${result.reason}&next=${encodeURIComponent(result.next)}`,
        );
      if (result.linkProof) {
        this.cookie(reply, linkCookie, result.linkProof);
        return reply.redirect(
          `${web}/login?google=link_required&next=${encodeURIComponent(result.next)}`,
        );
      }
      const session = await this.auth.loginWithGoogle(
        result.userId!,
        metadata(request),
      );
      reply.setCookie(this.config.refreshCookieName, session.refreshToken, {
        httpOnly: true,
        secure: this.config.cookieSecure,
        sameSite: this.config.cookieSameSite,
        domain: this.config.cookieDomain,
        path: "/api/v1/auth",
        expires: session.refreshTokenExpiresAt,
      });
      this.clear(reply, linkCookie);
      return reply.redirect(
        `${web}/auth/google/complete?next=${encodeURIComponent(result.next)}`,
      );
    } catch (error) {
      const response =
        error &&
        typeof error === "object" &&
        "getResponse" in error &&
        typeof error.getResponse === "function"
          ? (error.getResponse() as { error?: { code?: string } })
          : null;
      const code = response?.error?.code;
      const reason =
        code === "AUTH_GOOGLE_SIGNUP_REQUIRED"
          ? "signup_required"
          : code === "AUTH_GOOGLE_CANCELLED"
            ? "cancelled"
            : "failed";
      this.clear(reply, linkCookie);
      return reply.redirect(`${web}/login?google=${reason}`);
    }
  }
  @Post("link")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Link a verified Google identity after existing-account password authentication",
  })
  @ApiOkResponse({ type: GoogleLinkResponse })
  async link(
    @Body() dto: LinkGoogleDto,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    this.security.assertTrustedOrigin(request);
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    const result = await this.google.link(
      request.cookies[linkCookie],
      user,
      dto.password,
      request.ip,
    );
    this.clear(reply, linkCookie);
    return result;
  }
  private cookie(reply: FastifyReply, name: string, value: string) {
    reply.setCookie(name, value, {
      httpOnly: true,
      secure: this.config.cookieSecure,
      sameSite: "lax",
      path: "/api/v1/auth",
      maxAge: 600,
    });
  }
  private clear(reply: FastifyReply, name: string) {
    reply.clearCookie(name, { path: "/api/v1/auth" });
  }
}
function metadata(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: request.headers["user-agent"],
    origin: request.headers.origin,
  };
}
export function googleCallbackInput(query: Record<string, unknown>) {
  function field(key: string, limit: number) {
    const value = query[key];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.length > limit)
      throw new ApiErrorException(
        400,
        "AUTH_GOOGLE_REQUEST_INVALID",
        "Invalid Google callback.",
      );
    return value;
  }
  // OIDC requires ignoring unrecognized response parameters; validate only the fields used.
  return {
    state: field("state", 128),
    code: field("code", 4096),
    error: field("error", 256),
  };
}
