import "reflect-metadata";

import fastifyCookie from "@fastify/cookie";
import { HttpStatus, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { UserStatus } from "@prisma/client";
import request, { type Test } from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

import { createSelfxId } from "@selfx/database";

import { AppModule } from "../app.module.js";
import { AuthService } from "../auth/auth.service.js";
import { AUTH_ERROR_CODES } from "../auth/auth.constants.js";
import { ApiErrorException } from "./api-error.exception.js";
import { COMMON_ERROR_CODES } from "./common-error-codes.js";
import { PrismaExceptionFilter } from "./prisma-exception.filter.js";
import { loadSelfxEnv } from "../config/load-env.js";
import { PrismaService } from "../database/prisma.service.js";

loadSelfxEnv();

describe("HTTP security boundary", () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let auth: AuthService;
  let userId: string;
  let accessToken: string;
  let organizationIds: string[];

  beforeAll(async () => {
    app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      new FastifyAdapter(),
      { logger: false },
    );
    await app.register(fastifyCookie);
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        exceptionFactory: () =>
          new ApiErrorException(
            HttpStatus.BAD_REQUEST,
            AUTH_ERROR_CODES.validationFailed,
            "Request validation failed.",
          ),
      }),
    );
    app.useGlobalFilters(new PrismaExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    prisma = app.get(PrismaService);
    auth = app.get(AuthService);
  });

  beforeEach(async () => {
    organizationIds = [];
    userId = createSelfxId();
    await prisma.user.create({
      data: {
        id: userId,
        email: `http-${userId}@phase3c.test`,
        passwordHash: "not-used-in-http-security-tests",
        status: UserStatus.ACTIVE,
      },
    });
    accessToken = await auth.signAccessTokenForTest(userId);
  });

  afterEach(async () => {
    await cleanupTestRecords(prisma, userId, organizationIds);
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns stable 400 errors for malformed UUID path parameters", async () => {
    await expectInvalidUuid(
      request(app.getHttpServer())
        .get("/api/v1/organizations/not-a-uuid")
        .set("Authorization", `Bearer ${accessToken}`),
    );

    const validOrganizationId = createSelfxId();
    await expectInvalidUuid(
      request(app.getHttpServer())
        .get(`/api/v1/organizations/${validOrganizationId}/stores/not-a-uuid`)
        .set("Authorization", `Bearer ${accessToken}`),
    );

    await expectInvalidUuid(
      request(app.getHttpServer())
        .patch(
          `/api/v1/organizations/${validOrganizationId}/memberships/not-a-uuid`,
        )
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ role: "ORGANIZATION_STAFF" }),
    );

    await expectInvalidUuid(
      request(app.getHttpServer())
        .get("/api/v1/organization-applications/not-a-uuid")
        .set("Authorization", `Bearer ${accessToken}`),
    );
  });

  it("maps duplicate unique resources to stable safe API errors", async () => {
    const slug = `phase3c-${createSelfxId()}`;
    const first = await request(app.getHttpServer())
      .post("/api/v1/organization-applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        organizationName: "Phase 3C Duplicate",
        slug,
      })
      .expect(201);
    organizationIds.push(first.body.organization.id as string);

    const duplicate = await request(app.getHttpServer())
      .post("/api/v1/organization-applications")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        organizationName: "Phase 3C Duplicate Again",
        slug,
      })
      .expect(409);

    expect(duplicate.body).toMatchObject({
      error: { code: COMMON_ERROR_CODES.resourceAlreadyExists },
    });
    expect(JSON.stringify(duplicate.body)).not.toContain("Prisma");
    expect(JSON.stringify(duplicate.body)).not.toContain("Unique constraint");
  });
});

async function expectInvalidUuid(pending: Test): Promise<void> {
  const response = await pending.expect(400);
  expect(response.body).toMatchObject({
    error: { code: COMMON_ERROR_CODES.invalidUuidPathParameter },
  });
  expect(JSON.stringify(response.body)).not.toContain("Prisma");
}

async function cleanupTestRecords(
  prisma: PrismaService,
  userId: string,
  organizationIds: string[],
): Promise<void> {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: userId },
        { organizationId: { in: organizationIds } },
      ],
    },
  });
  await prisma.organizationActivationRequirement.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await prisma.organizationApplication.deleteMany({
    where: { organizationId: { in: organizationIds } },
  });
  await prisma.membershipStoreScope.deleteMany({
    where: { orgId: { in: organizationIds } },
  });
  await prisma.organizationMembership.deleteMany({
    where: {
      OR: [{ orgId: { in: organizationIds } }, { userId }],
    },
  });
  await prisma.platformRoleAssignment.deleteMany({ where: { userId } });
  await prisma.store.deleteMany({ where: { orgId: { in: organizationIds } } });
  await prisma.organization.deleteMany({
    where: { id: { in: organizationIds } },
  });
  await prisma.userSession.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
}
