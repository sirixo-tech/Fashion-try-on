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
      termsVersion: "2026-10-25",
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
