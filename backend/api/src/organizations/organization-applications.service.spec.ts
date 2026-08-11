import {
  MembershipStatus,
  OrganizationApplicationStatus,
  OrganizationMembershipRole,
  OrganizationStatus,
  PlatformRole,
  PlatformRoleAssignmentStatus,
  UserStatus,
} from "@prisma/client";
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

import { ApiErrorException } from "../common/api-error.exception.js";
import { loadSelfxEnv } from "../config/load-env.js";
import { PrismaService } from "../database/prisma.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { OrganizationApplicationsService } from "./organization-applications.service.js";
import { ORGANIZATION_ERROR_CODES } from "./organization-error-codes.js";
import { OrganizationTenantGuardService } from "./organization-tenant-guard.service.js";

loadSelfxEnv();

describe("OrganizationApplicationsService Phase 3A", () => {
  let prisma: PrismaService;
  let service: OrganizationApplicationsService;
  let tenantGuard: OrganizationTenantGuardService;
  let userIds: string[];
  let organizationIds: string[];
  let sequence: number;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const platformAuthorization = new PlatformAuthorizationService(prisma);
    service = new OrganizationApplicationsService(
      prisma,
      platformAuthorization,
    );
    tenantGuard = new OrganizationTenantGuardService(prisma);
  });

  beforeEach(() => {
    userIds = [];
    organizationIds = [];
    sequence = 0;
  });

  afterEach(async () => {
    await cleanupTestRecords(prisma, userIds, organizationIds);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a pending organization shell and pending owner membership", async () => {
    const applicant = await createUser("applicant");
    const application = await createDraft(applicant.id);

    expect(application.status).toBe(OrganizationApplicationStatus.DRAFT);
    expect(application.organization.status).toBe(
      OrganizationStatus.PENDING_ACTIVATION,
    );
    expect(application.intendedOwnerMembership).toMatchObject({
      role: OrganizationMembershipRole.ORGANIZATION_OWNER,
      status: MembershipStatus.PENDING_ACTIVATION,
      storeScopeMode: "ALL_STORES",
    });

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: application.organization.id },
      include: { memberships: true },
    });
    expect(organization.status).toBe(OrganizationStatus.PENDING_ACTIVATION);
    expect(organization.memberships[0]?.status).toBe(
      MembershipStatus.PENDING_ACTIVATION,
    );
  });

  it("keeps applicant and platform authority separate", async () => {
    const applicant = await createUser("merchant");
    const application = await createDraft(applicant.id);

    await expectApiCode(
      service.approve(applicant.id, application.id),
      "PLATFORM_PERMISSION_DENIED",
    );
    await expectApiCode(
      tenantGuard.requireActiveTenantMembership(
        applicant.id,
        application.organization.id,
      ),
      ORGANIZATION_ERROR_CODES.organizationNotActive,
    );
  });

  it("does not expose one applicant's application through another applicant's APIs", async () => {
    const owner = await createUser("owner");
    const other = await createUser("other");
    const application = await createDraft(owner.id);

    await expectApiCode(
      service.getApplicantApplication(other.id, application.id),
      ORGANIZATION_ERROR_CODES.applicationNotFound,
    );
  });

  it("denies platform review access without the centralized platform permission", async () => {
    const user = await createUser("staff-without-platform-role");

    await expectApiCode(
      service.listPlatformApplications(user.id, {}),
      "PLATFORM_PERMISSION_DENIED",
    );
  });

  it("allows valid review transitions and rejects invalid transitions", async () => {
    const applicant = await createUser("applicant");
    const admin = await createPlatformAdmin("admin");
    const application = await createDraft(applicant.id);

    await expectApiCode(
      service.approve(admin.id, application.id),
      ORGANIZATION_ERROR_CODES.invalidApplicationTransition,
    );

    const submitted = await service.submitApplicantApplication(
      applicant.id,
      application.id,
    );
    expect(submitted.status).toBe(OrganizationApplicationStatus.SUBMITTED);

    const review = await service.startReview(admin.id, application.id);
    expect(review.status).toBe(OrganizationApplicationStatus.UNDER_REVIEW);

    const needsInformation = await service.requestInformation(
      admin.id,
      application.id,
      "Need registration evidence.",
    );
    expect(needsInformation.status).toBe(
      OrganizationApplicationStatus.NEEDS_INFORMATION,
    );

    await service.submitApplicantApplication(applicant.id, application.id);
    await service.startReview(admin.id, application.id);
    const approved = await service.approve(admin.id, application.id);

    expect(approved.status).toBe(OrganizationApplicationStatus.APPROVED);
    expect(approved.organization.status).toBe(
      OrganizationStatus.PENDING_ACTIVATION,
    );
  });

  it("prevents concurrent stale application transitions from both succeeding", async () => {
    const applicant = await createUser("applicant");
    const admin = await createPlatformAdmin("admin");
    const application = await createDraft(applicant.id);
    await service.submitApplicantApplication(applicant.id, application.id);
    await service.startReview(admin.id, application.id);

    const results = await Promise.allSettled([
      service.approve(admin.id, application.id, "approved"),
      service.reject(admin.id, application.id, "rejected"),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const stored = await prisma.organizationApplication.findUniqueOrThrow({
      where: { id: application.id },
      select: { status: true },
    });
    expect([
      OrganizationApplicationStatus.APPROVED,
      OrganizationApplicationStatus.REJECTED,
    ]).toContain(stored.status);
  });

  it("requires approval and completed activation requirements before activation", async () => {
    const applicant = await createUser("applicant");
    const admin = await createPlatformAdmin("admin");
    const application = await createDraft(applicant.id);

    await expectApiCode(
      service.activateOrganization(admin.id, application.organization.id),
      ORGANIZATION_ERROR_CODES.notActivatable,
    );

    await service.submitApplicantApplication(applicant.id, application.id);
    await service.startReview(admin.id, application.id);
    await service.approve(admin.id, application.id);

    const withRequirement = await service.createRequirement(
      admin.id,
      application.id,
      {
        code: "BUSINESS_VERIFICATION",
        required: true,
      },
    );
    const requirement = withRequirement.activationRequirements[0]!;

    await expectApiCode(
      service.activateOrganization(admin.id, application.organization.id),
      ORGANIZATION_ERROR_CODES.activationRequirementsIncomplete,
    );

    await service.satisfyRequirement(admin.id, application.id, requirement.id);
    const activated = await service.activateOrganization(
      admin.id,
      application.organization.id,
    );

    expect(activated.organization.status).toBe(OrganizationStatus.ACTIVE);
    expect(activated.intendedOwnerMembership?.status).toBe(
      MembershipStatus.ACTIVE,
    );
    await expectApiCode(
      service.activateOrganization(admin.id, application.organization.id),
      ORGANIZATION_ERROR_CODES.alreadyActive,
    );
  });

  it("supports waived requirements and blocks suspended organizations from normal tenant access", async () => {
    const applicant = await createUser("applicant");
    const admin = await createPlatformAdmin("admin");
    const application = await approveApplication(applicant.id, admin.id);
    const withRequirement = await service.createRequirement(
      admin.id,
      application.id,
      {
        code: "COMMERCIAL_TERMS",
        required: true,
      },
    );

    await service.waiveRequirement(
      admin.id,
      application.id,
      withRequirement.activationRequirements[0]!.id,
    );
    await service.activateOrganization(admin.id, application.organization.id);
    await tenantGuard.requireActiveTenantMembership(
      applicant.id,
      application.organization.id,
    );

    await service.suspendOrganization(admin.id, application.organization.id);
    await expectApiCode(
      tenantGuard.requireActiveTenantMembership(
        applicant.id,
        application.organization.id,
      ),
      ORGANIZATION_ERROR_CODES.suspended,
    );
  });

  it("bounds listing endpoints and uses deterministic cursor pagination", async () => {
    const applicant = await createUser("applicant");
    const admin = await createPlatformAdmin("admin");
    for (let index = 0; index < 27; index += 1) {
      await createDraft(applicant.id);
    }

    const firstPage = await service.listApplicantApplications(applicant.id, {});
    expect(firstPage.data).toHaveLength(25);
    expect(firstPage.pagination.hasMore).toBe(true);
    expect(firstPage.pagination.nextCursor).toEqual(expect.any(String));

    const secondPage = await service.listApplicantApplications(applicant.id, {
      cursor: firstPage.pagination.nextCursor ?? undefined,
      pageSize: 1000,
    });
    expect(secondPage.data).toHaveLength(2);

    const platformPage = await service.listPlatformApplications(admin.id, {
      pageSize: 101,
    });
    expect(platformPage.data.length).toBeLessThanOrEqual(100);
  });

  it("writes audit events for important transitions and keeps platform roles out of merchant memberships", async () => {
    const applicant = await createUser("applicant");
    const admin = await createPlatformAdmin("admin");
    const application = await approveApplication(applicant.id, admin.id);
    const withRequirement = await service.createRequirement(
      admin.id,
      application.id,
      {
        code: "PRICING_APPROVAL",
        required: true,
      },
    );
    await service.satisfyRequirement(
      admin.id,
      application.id,
      withRequirement.activationRequirements[0]!.id,
    );
    await service.activateOrganization(admin.id, application.organization.id);

    const auditActions = await prisma.auditLog.findMany({
      where: { organizationId: application.organization.id },
      select: { action: true, actorUserId: true },
      orderBy: { createdAt: "asc" },
    });
    expect(auditActions.map((event) => event.action)).toEqual(
      expect.arrayContaining([
        "ORGANIZATION_APPLICATION_CREATED",
        "ORGANIZATION_APPLICATION_SUBMITTED",
        "ORGANIZATION_APPLICATION_REVIEW_STARTED",
        "ORGANIZATION_APPLICATION_APPROVED",
        "ORGANIZATION_ACTIVATION_REQUIREMENT_CREATED",
        "ORGANIZATION_ACTIVATION_REQUIREMENT_SATISFIED",
        "ORGANIZATION_ACTIVATED",
      ]),
    );
    expect(auditActions.every((event) => event.actorUserId)).toBe(true);

    const adminMemberships = await prisma.organizationMembership.count({
      where: { userId: admin.id },
    });
    const adminPlatformRoles = await prisma.platformRoleAssignment.count({
      where: { userId: admin.id },
    });
    expect(adminMemberships).toBe(0);
    expect(adminPlatformRoles).toBe(1);
  });

  async function approveApplication(applicantId: string, adminId: string) {
    const application = await createDraft(applicantId);
    await service.submitApplicantApplication(applicantId, application.id);
    await service.startReview(adminId, application.id);
    return service.approve(adminId, application.id);
  }

  async function createDraft(userId: string) {
    sequence += 1;
    const application = await service.createDraft(userId, {
      organizationName: `Phase 3A Test ${sequence}`,
      slug: `phase3a-${createSelfxId()}`,
    });
    organizationIds.push(application.organization.id);
    return application;
  }

  async function createUser(label: string) {
    const id = createSelfxId();
    userIds.push(id);
    return prisma.user.create({
      data: {
        id,
        email: `${label}-${id}@phase3a.test`,
        passwordHash: "not-used-in-phase-3a-tests",
        status: UserStatus.ACTIVE,
      },
    });
  }

  async function createPlatformAdmin(label: string) {
    const user = await createUser(label);
    await prisma.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId: user.id,
        role: PlatformRole.SELFX_SUPER_ADMIN,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
    });
    return user;
  }
});

async function expectApiCode(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(ApiErrorException);
    expect((error as ApiErrorException).getResponse()).toMatchObject({
      error: { code },
    });
  }
}

async function cleanupTestRecords(
  prisma: PrismaService,
  userIds: string[],
  organizationIds: string[],
): Promise<void> {
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: userIds } },
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
      OR: [{ orgId: { in: organizationIds } }, { userId: { in: userIds } }],
    },
  });
  await prisma.platformRoleAssignment.deleteMany({
    where: { userId: { in: userIds } },
  });
  await prisma.store.deleteMany({ where: { orgId: { in: organizationIds } } });
  await prisma.organization.deleteMany({
    where: { id: { in: organizationIds } },
  });
  await prisma.userSession.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}
