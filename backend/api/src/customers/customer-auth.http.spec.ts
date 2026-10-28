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
import { ApiErrorException } from "../common/api-error.exception.js";
import { CustomerAuthController } from "./customer-auth.controller.js";
import { CustomerAuthService } from "./customer-auth.service.js";
import { CUSTOMER_TERMS_VERSION } from "./customer.config.js";

describe("Customer HTTP validation and auth boundary", () => {
  let app: NestFastifyApplication;
  const auth = {
    capabilities: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    me: vi.fn(),
    updateProfile: vi.fn(),
    deleteAccount: vi.fn(),
    refresh: vi.fn(),
    emailLogin: vi.fn(),
    requestEmailLogin: vi.fn(),
    phoneRequest: vi.fn(),
    phoneLogin: vi.fn(),
    linkPhone: vi.fn(),
    linkOAuth: vi.fn(),
  };
  beforeAll(async () => {
    @Module({
      controllers: [CustomerAuthController],
      providers: [{ provide: CustomerAuthService, useValue: auth }],
    })
    class CustomerTestModule {}
    app = await NestFactory.create<NestFastifyApplication>(
      CustomerTestModule,
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
  });
  beforeEach(() => {
    vi.resetAllMocks();
    auth.capabilities.mockReturnValue({ enabled: false });
    auth.login.mockRejectedValue(
      new ApiErrorException(
        401,
        "CUSTOMER_INVALID_CREDENTIALS",
        "Check your details or create an account.",
      ),
    );
    auth.me.mockRejectedValue(
      new ApiErrorException(
        401,
        "CUSTOMER_UNAUTHORIZED",
        "Please sign in again.",
      ),
    );
    auth.updateProfile.mockResolvedValue({ displayName: "Ava" });
    auth.signup.mockResolvedValue({
      message: "Check your email.",
      signupProof: "a".repeat(43),
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  it("does not accept client-supplied Google email authority", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/customer/auth/oauth",
      payload: {
        provider: "GOOGLE",
        idToken: "x".repeat(30),
        emailAuthoritative: true,
      },
    });
    expect(response.statusCode).toBe(400);
  });
  it("accepts canonical mobile/password login while rejecting ambiguous or invalid contact payloads", async () => {
    auth.login.mockResolvedValue({ accessToken: "fixture" });
    for (const email of ["customer@example.test", "+919876543210"]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/customer/auth/login",
            payload: { email, password: "fixture-password" },
          })
        ).statusCode,
      ).toBe(201);
      expect(auth.login).toHaveBeenCalledWith(
        email,
        "fixture-password",
        expect.any(String),
        undefined,
      );
    }
    for (const email of ["9876543210", "bad email", "+00000000", ""]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/customer/auth/login",
            payload: { email, password: "fixture-password" },
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/customer/me/oauth",
          payload: {
            provider: "GOOGLE",
            idToken: "x".repeat(30),
            customerId: "forged",
          },
        })
      ).statusCode,
    ).toBe(400);
    auth.linkOAuth.mockRejectedValue(
      new ApiErrorException(
        401,
        "CUSTOMER_UNAUTHORIZED",
        "Please sign in again.",
      ),
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/customer/me/oauth",
          payload: { provider: "GOOGLE", idToken: "x".repeat(30) },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("requires a bound six-digit email login proof and disallows client phone ownership claims", async () => {
    for (const code of ["1234", "12345678", "abcdef"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/customer/auth/email-code/login",
        payload: {
          email: "customer@example.test",
          code,
          loginProof: "a".repeat(43),
        },
      });
      expect(response.statusCode).toBe(400);
    }
    auth.emailLogin.mockResolvedValue({ accessToken: "fixture" });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/customer/auth/email-code/login",
      payload: {
        email: "customer@example.test",
        code: "123456",
        loginProof: "a".repeat(43),
      },
    });
    expect(response.statusCode).toBe(201);
    expect(auth.emailLogin).toHaveBeenCalledOnce();
    for (const payload of [
      { phoneNumber: "+919876543210", customerId: "attacker" },
      { idToken: "a".repeat(30), customerId: "attacker" },
      { idToken: "a".repeat(30), acceptPhoneVerification: false },
    ]) {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/v1/customer/me/phone",
            payload,
          })
        ).statusCode,
      ).toBe(400);
    }
    expect(auth.linkPhone).not.toHaveBeenCalled();
    auth.linkPhone.mockResolvedValue({ phoneNumber: "+919876543210" });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/customer/me/phone",
          headers: { authorization: "Bearer fixture" },
          payload: { idToken: "a".repeat(30), acceptPhoneVerification: true },
        })
      ).statusCode,
    ).toBe(201);
    expect(auth.linkPhone).toHaveBeenCalledWith(
      "Bearer fixture",
      "a".repeat(30),
      expect.any(String),
    );
  });
  it("exposes capabilities and returns safe structured sign-in errors without cookies", async () => {
    const capabilities = await app.inject({
      method: "GET",
      url: "/api/v1/customer/auth/capabilities",
    });
    expect(capabilities.json()).toEqual({ enabled: false });
    expect(capabilities.headers["cache-control"]).toBe("no-store");
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/customer/auth/login",
      payload: { email: "customer@selfx.invalid", password: "incorrect" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toHaveProperty(
      "error.code",
      "CUSTOMER_INVALID_CREDENTIALS",
    );
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
  it("validates inherited signup email, length, policy consent and disallows merchant fields", async () => {
    const valid = {
      email: "customer@selfx.invalid",
      password: "a-secure-passphrase",
      displayName: "Ava",
      acceptTerms: true,
      termsVersion: CUSTOMER_TERMS_VERSION,
    };
    for (const changes of [
      { email: "bad-email" },
      { password: "short" },
      { acceptTerms: false },
      { termsVersion: "old" },
      { role: "SELFX_SUPER_ADMIN" },
    ]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/v1/customer/auth/signup",
        payload: { ...valid, ...changes },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(auth.signup).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/customer/auth/signup",
          payload: valid,
        })
      ).statusCode,
    ).toBe(201);
  });
  it("does not accept profile ownership/role fields and forwards only the bearer identity", async () => {
    for (const field of [
      "customerId",
      "organizationId",
      "role",
      "email",
      "securityVersion",
    ]) {
      const response = await app.inject({
        method: "PATCH",
        url: "/api/v1/customer/me",
        headers: { authorization: "Bearer fixture" },
        payload: { [field]: "attacker" },
      });
      expect(response.statusCode).toBe(400);
    }
    expect(auth.updateProfile).not.toHaveBeenCalled();
    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/customer/me",
      headers: { authorization: "Bearer fixture" },
      payload: { displayName: "Ava" },
    });
    expect(response.statusCode).toBe(200);
    expect(auth.updateProfile).toHaveBeenCalledWith(
      "Bearer fixture",
      expect.objectContaining({ displayName: "Ava" }),
    );
    expect(
      (await app.inject({ method: "GET", url: "/api/v1/customer/me" }))
        .statusCode,
    ).toBe(401);
  });
  it("requires explicit deletion confirmation and restricts code/token formats", async () => {
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: "/api/v1/customer/me",
          payload: { confirmation: "yes", password: "password" },
        })
      ).statusCode,
    ).toBe(400);
    expect(auth.deleteAccount).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/customer/auth/refresh",
          payload: { refreshToken: "bad-token" },
        })
      ).statusCode,
    ).toBe(400);
    expect(auth.refresh).not.toHaveBeenCalled();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/customer/auth/verify-email",
          payload: {
            email: "customer@selfx.invalid",
            code: "1234",
            signupProof: "a".repeat(43),
          },
        })
      ).statusCode,
    ).toBe(400);
  });
});
