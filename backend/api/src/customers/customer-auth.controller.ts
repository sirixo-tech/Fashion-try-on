import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Patch,
  Post,
  Req,
  Optional,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CustomerExperienceService } from "./customer-experience.service.js";
import {
  CustomerDeleteDto,
  CustomerEmailDto,
  CustomerLoginDto,
  CustomerOAuthDto,
  CustomerProfileDto,
  CustomerRefreshDto,
  CustomerResetDto,
  CustomerSignupDto,
  CustomerResendDto,
  CustomerVerificationDto,
} from "./customer.dto.js";

@ApiTags("Customer accounts")
@Controller("api/v1/customer")
export class CustomerAuthController {
  constructor(private readonly auth: CustomerAuthService,
    @Optional() private readonly experience?: CustomerExperienceService) {}
  @Header("Cache-Control", "no-store")
  @Get("auth/capabilities")
  async capabilities() {
    const base = this.auth.capabilities();
    if (!this.experience) return base;
    const ready = await this.experience.available();
    return { ...base, features: { ...base.features, tryOn: ready, storeQr: ready } };
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/signup")
  signup(@Body() dto: CustomerSignupDto, @Req() request: FastifyRequest) {
    return this.auth.signup(dto, request.ip);
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/login")
  login(@Body() dto: CustomerLoginDto, @Req() request: FastifyRequest) {
    return this.auth.login(dto.email, dto.password, request.ip, dto.deviceName);
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/verify-email")
  verify(@Body() dto: CustomerVerificationDto, @Req() request: FastifyRequest) {
    return this.auth.verifyEmail(
      dto.email,
      dto.code,
      request.ip,
      dto.signupProof,
    );
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/resend-verification")
  resend(@Body() dto: CustomerResendDto, @Req() request: FastifyRequest) {
    return this.auth.requestCode(
      dto.email,
      "VERIFY_EMAIL",
      request.ip,
      dto.signupProof,
    );
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/forgot-password")
  forgot(@Body() dto: CustomerEmailDto, @Req() request: FastifyRequest) {
    return this.auth.requestCode(dto.email, "RESET_PASSWORD", request.ip);
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/reset-password")
  reset(@Body() dto: CustomerResetDto, @Req() request: FastifyRequest) {
    return this.auth.resetPassword(
      dto.email,
      dto.code,
      dto.password,
      request.ip,
    );
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/refresh")
  refresh(@Body() dto: CustomerRefreshDto, @Req() request: FastifyRequest) {
    return this.auth.refresh(dto.refreshToken, request.ip);
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/apple-challenge")
  challenge(@Req() request: FastifyRequest) {
    return this.auth.appleChallenge(request.ip);
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/oauth")
  oauth(@Body() dto: CustomerOAuthDto, @Req() request: FastifyRequest) {
    return this.auth.oauth(dto, request.ip);
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/logout")
  logout(@Req() request: FastifyRequest) {
    return this.auth.logout(request.headers.authorization);
  }
  @Header("Cache-Control", "no-store")
  @Post("auth/logout-all")
  logoutAll(@Req() request: FastifyRequest) {
    return this.auth.logout(request.headers.authorization, true);
  }
  @Header("Cache-Control", "no-store")
  @Get("me")
  me(@Req() request: FastifyRequest) {
    return this.auth.me(request.headers.authorization);
  }
  @Header("Cache-Control", "no-store")
  @Patch("me")
  update(@Body() dto: CustomerProfileDto, @Req() request: FastifyRequest) {
    return this.auth.updateProfile(request.headers.authorization, dto);
  }
  @Header("Cache-Control", "no-store")
  @Delete("me")
  async delete(@Body() dto: CustomerDeleteDto, @Req() request: FastifyRequest) {
    const principal = this.experience ? await this.auth.requireCustomer(request.headers.authorization) : null;
    const response = await this.auth.deleteAccount(
      request.headers.authorization,
      dto,
      request.ip,
    );
    if (principal) await this.experience!.eraseCustomerPhotos(principal.customer.id).catch(() => undefined);
    return response;
  }
}
