import { validate } from "class-validator";
import {
  MembershipStatus,
  MembershipStoreScopeMode,
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
import {
  CreateMembershipDto,
  UpdateStoreDto,
} from "./dto/tenant-commands.dto.js";
import { TenantManagementService } from "./tenant-management.service.js";
import { TenantAuthorizationService } from "./tenant-authorization.service.js";
import { ORGANIZATION_ERROR_CODES } from "./organization-error-codes.js";

loadSelfxEnv();

describe("TenantManagementService Phase 3B", () => {
  let prisma: PrismaService;
  let service: TenantManagementService;
  let userIds: string[];
  let organizationIds: string[];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new TenantManagementService(
      prisma,
      new TenantAuthorizationService(prisma),
    );
  });

  beforeEach(() => {
    userIds = [];
    organizationIds = [];
  });

  afterEach(async () => {
    await cleanupTestRecords(prisma, userIds, organizationIds);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("prevents cross-organization access and URL organizationId manipulation", async () => {
    const ownerA = await createUser("owner-a");
    const ownerB = await createUser("owner-b");
    const orgA = await createOrganizationWithMember(
      ownerA.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const orgB = await createOrganizationWithMember(
      ownerB.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );

    await expectApiCode(
      service.getOrganization(ownerA.id, orgB.id),
      ORGANIZATION_ERROR_CODES.organizationAccessDenied,
    );
    await expectApiCode(
      service.updateOrganization(ownerA.id, orgB.id, { name: "nope" }),
      ORGANIZATION_ERROR_CODES.organizationAccessDenied,
    );
    const list = await service.listOrganizations(ownerA.id, {});
    expect(list.data.map((org) => org.id)).toEqual([orgA.id]);
  });

  it("blocks pending and suspended organizations from tenant APIs", async () => {
    const owner = await createUser("owner");
    const pending = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
      { status: OrganizationStatus.PENDING_ACTIVATION },
    );
    const suspended = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
      { status: OrganizationStatus.SUSPENDED },
    );

    await expectApiCode(
      service.getOrganization(owner.id, pending.id),
      ORGANIZATION_ERROR_CODES.organizationNotActive,
    );
    await expectApiCode(
      service.getOrganization(owner.id, suspended.id),
      ORGANIZATION_ERROR_CODES.suspended,
    );
  });

  it("blocks suspended memberships from tenant APIs", async () => {
    const staff = await createUser("staff");
    const org = await createOrganizationWithMember(
      staff.id,
      OrganizationMembershipRole.ORGANIZATION_STAFF,
      { membershipStatus: MembershipStatus.SUSPENDED },
    );

    await expectApiCode(
      service.getOrganization(staff.id, org.id),
      ORGANIZATION_ERROR_CODES.membershipInactive,
    );
  });

  it("enforces store ownership and selected-store scope boundaries", async () => {
    const owner = await createUser("owner");
    const staff = await createUser("staff");
    const otherOwner = await createUser("other-owner");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const otherOrg = await createOrganizationWithMember(
      otherOwner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const storeA = await createStore(org.id, "A");
    const storeB = await createStore(org.id, "B");
    const otherStore = await createStore(otherOrg.id, "Other");
    await createMembership(
      org.id,
      staff.id,
      OrganizationMembershipRole.STORE_STAFF,
      {
        storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
        storeIds: [storeA.id],
      },
    );

    await expect(
      service.getStore(staff.id, org.id, storeA.id),
    ).resolves.toMatchObject({
      id: storeA.id,
    });
    await expectApiCode(
      service.getStore(staff.id, org.id, storeB.id),
      ORGANIZATION_ERROR_CODES.storeAccessDenied,
    );
    await expectApiCode(
      service.getStore(staff.id, org.id, otherStore.id),
      ORGANIZATION_ERROR_CODES.storeNotFound,
    );
  });

  it("treats SELECTED_STORES with zero rows as zero store access", async () => {
    const owner = await createUser("owner");
    const staff = await createUser("staff");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const store = await createStore(org.id, "A");
    await createMembership(
      org.id,
      staff.id,
      OrganizationMembershipRole.STORE_STAFF,
      {
        storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
        storeIds: [],
      },
    );

    const list = await service.listStores(staff.id, org.id, {});
    expect(list.data).toHaveLength(0);
    await expectApiCode(
      service.getStore(staff.id, org.id, store.id),
      ORGANIZATION_ERROR_CODES.storeAccessDenied,
    );
  });

  it("allows ALL_STORES access without scope rows", async () => {
    const owner = await createUser("owner");
    const staff = await createUser("staff");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const storeA = await createStore(org.id, "A");
    const storeB = await createStore(org.id, "B");
    await createMembership(
      org.id,
      staff.id,
      OrganizationMembershipRole.STORE_STAFF,
      {
        storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
      },
    );

    await expect(
      service.getStore(staff.id, org.id, storeA.id),
    ).resolves.toMatchObject({
      id: storeA.id,
    });
    await expect(
      service.getStore(staff.id, org.id, storeB.id),
    ).resolves.toMatchObject({
      id: storeB.id,
    });
  });

  it("rejects cross-organization store scope assignment", async () => {
    const owner = await createUser("owner");
    const staff = await createUser("staff");
    const otherOwner = await createUser("other-owner");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const otherOrg = await createOrganizationWithMember(
      otherOwner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const otherStore = await createStore(otherOrg.id, "Other");

    await expectApiCode(
      service.createMembership(owner.id, org.id, {
        userId: staff.id,
        role: OrganizationMembershipRole.STORE_STAFF,
        storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
        storeIds: [otherStore.id],
      }),
      ORGANIZATION_ERROR_CODES.crossOrganizationStoreScope,
    );
  });

  it("rejects incompatible merchant role and store-scope combinations", async () => {
    const owner = await createUser("owner");
    const staff = await createUser("staff");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const store = await createStore(org.id, "Scoped Store");

    await expectApiCode(
      service.createMembership(owner.id, org.id, {
        userId: staff.id,
        role: OrganizationMembershipRole.KIOSK_OPERATOR,
        storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
      }),
      ORGANIZATION_ERROR_CODES.invalidRoleStoreScope,
    );

    await expectApiCode(
      service.createMembership(owner.id, org.id, {
        userId: staff.id,
        role: OrganizationMembershipRole.STORE_STAFF,
        storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
      }),
      ORGANIZATION_ERROR_CODES.invalidRoleStoreScope,
    );

    await expectApiCode(
      service.createMembership(owner.id, org.id, {
        userId: staff.id,
        role: OrganizationMembershipRole.STORE_MANAGER,
        storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
      }),
      ORGANIZATION_ERROR_CODES.invalidRoleStoreScope,
    );

    const accepted = await service.createMembership(owner.id, org.id, {
      userId: staff.id,
      role: OrganizationMembershipRole.STORE_MANAGER,
      storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
      storeIds: [store.id],
    });
    expect(accepted.storeIds).toEqual([store.id]);
  });

  it("requires role updates to provide a compatible replacement scope atomically", async () => {
    const owner = await createUser("owner");
    const staff = await createUser("staff");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const store = await createStore(org.id, "Scoped Store");
    const membership = await service.createMembership(owner.id, org.id, {
      userId: staff.id,
      role: OrganizationMembershipRole.ORGANIZATION_STAFF,
      storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
    });

    await expectApiCode(
      service.updateMembership(owner.id, org.id, membership.id, {
        role: OrganizationMembershipRole.STORE_MANAGER,
      }),
      ORGANIZATION_ERROR_CODES.invalidRoleStoreScope,
    );

    const updated = await service.updateMembership(
      owner.id,
      org.id,
      membership.id,
      {
        role: OrganizationMembershipRole.STORE_MANAGER,
        storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
        storeIds: [store.id],
      },
    );
    expect(updated.role).toBe(OrganizationMembershipRole.STORE_MANAGER);
    expect(updated.storeScopeMode).toBe(
      MembershipStoreScopeMode.SELECTED_STORES,
    );
  });

  it("rejects invalid or oversized membership storeIds combinations", async () => {
    const owner = await createUser("owner");
    const staff = await createUser("staff");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const store = await createStore(org.id, "Scoped Store");

    await expectApiCode(
      service.createMembership(owner.id, org.id, {
        userId: staff.id,
        role: OrganizationMembershipRole.ORGANIZATION_STAFF,
        storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
        storeIds: [store.id],
      }),
      ORGANIZATION_ERROR_CODES.invalidStoreScope,
    );

    await expectApiCode(
      service.createMembership(owner.id, org.id, {
        userId: staff.id,
        role: OrganizationMembershipRole.STORE_STAFF,
        storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
        storeIds: [store.id, store.id],
      }),
      ORGANIZATION_ERROR_CODES.invalidStoreScope,
    );

    await expectApiCode(
      service.createMembership(owner.id, org.id, {
        userId: staff.id,
        role: OrganizationMembershipRole.STORE_STAFF,
        storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
        storeIds: Array.from({ length: 101 }, () => createSelfxId()),
      }),
      ORGANIZATION_ERROR_CODES.invalidStoreScope,
    );
  });

  it("allows owner authority and audits tenant mutations", async () => {
    const owner = await createUser("owner");
    const staff = await createUser("staff");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const store = await service.createStore(owner.id, org.id, { name: "A" });
    const membership = await service.createMembership(owner.id, org.id, {
      userId: staff.id,
      role: OrganizationMembershipRole.STORE_STAFF,
      storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
      storeIds: [store.id],
    });
    await service.updateMembership(owner.id, org.id, membership.id, {
      role: OrganizationMembershipRole.STORE_MANAGER,
      storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
      storeIds: [store.id],
    });
    await service.suspendMembership(owner.id, org.id, membership.id);
    await service.reactivateMembership(owner.id, org.id, membership.id);

    const actions = await prisma.auditLog.findMany({
      where: { organizationId: org.id },
      select: { action: true },
    });
    expect(actions.map((action) => action.action)).toEqual(
      expect.arrayContaining([
        "STORE_CREATED",
        "MEMBERSHIP_CREATED",
        "MEMBERSHIP_ROLE_CHANGED",
        "MEMBERSHIP_SCOPE_CHANGED",
        "MEMBERSHIP_SUSPENDED",
        "MEMBERSHIP_REACTIVATED",
      ]),
    );
  });

  it("prevents organization admins from granting or mutating owners", async () => {
    const owner = await createUser("owner");
    const admin = await createUser("admin");
    const staff = await createUser("staff");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const adminMembership = await createMembership(
      org.id,
      admin.id,
      OrganizationMembershipRole.ORGANIZATION_ADMIN,
      { storeScopeMode: MembershipStoreScopeMode.ALL_STORES },
    );
    const ownerMembership =
      await prisma.organizationMembership.findFirstOrThrow({
        where: { orgId: org.id, userId: owner.id },
      });

    await expectApiCode(
      service.createMembership(admin.id, org.id, {
        userId: staff.id,
        role: OrganizationMembershipRole.ORGANIZATION_OWNER,
        storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
      }),
      ORGANIZATION_ERROR_CODES.ownerRoleAssignmentForbidden,
    );
    await expectApiCode(
      service.updateMembership(admin.id, org.id, ownerMembership.id, {
        role: OrganizationMembershipRole.ORGANIZATION_STAFF,
      }),
      ORGANIZATION_ERROR_CODES.ownerMutationForbidden,
    );
    await expectApiCode(
      service.suspendMembership(admin.id, org.id, ownerMembership.id),
      ORGANIZATION_ERROR_CODES.ownerMutationForbidden,
    );
    await expect(
      service.getOrganization(admin.id, org.id),
    ).resolves.toMatchObject({
      id: org.id,
    });
    expect(adminMembership.role).toBe(
      OrganizationMembershipRole.ORGANIZATION_ADMIN,
    );
  });

  it("prevents the final active owner from being demoted or suspended", async () => {
    const owner = await createUser("owner");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const ownerMembership =
      await prisma.organizationMembership.findFirstOrThrow({
        where: { orgId: org.id, userId: owner.id },
      });

    await expectApiCode(
      service.updateMembership(owner.id, org.id, ownerMembership.id, {
        role: OrganizationMembershipRole.ORGANIZATION_ADMIN,
      }),
      ORGANIZATION_ERROR_CODES.lastOrganizationOwner,
    );
    await expectApiCode(
      service.suspendMembership(owner.id, org.id, ownerMembership.id),
      ORGANIZATION_ERROR_CODES.lastOrganizationOwner,
    );
  });

  it("prevents concurrent owner demotions from removing all active owners", async () => {
    const ownerA = await createUser("owner-a");
    const ownerB = await createUser("owner-b");
    const org = await createOrganizationWithMember(
      ownerA.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const membershipB = await createMembership(
      org.id,
      ownerB.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
      { storeScopeMode: MembershipStoreScopeMode.ALL_STORES },
    );
    const membershipA = await prisma.organizationMembership.findUniqueOrThrow({
      where: { orgId_userId: { orgId: org.id, userId: ownerA.id } },
    });

    const results = await Promise.allSettled([
      service.updateMembership(ownerA.id, org.id, membershipA.id, {
        role: OrganizationMembershipRole.ORGANIZATION_STAFF,
      }),
      service.updateMembership(ownerB.id, org.id, membershipB.id, {
        role: OrganizationMembershipRole.ORGANIZATION_STAFF,
      }),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expectActiveOwnerCount(org.id, 1);
  });

  it("prevents concurrent owner suspensions from removing all active owners", async () => {
    const ownerA = await createUser("owner-a");
    const ownerB = await createUser("owner-b");
    const org = await createOrganizationWithMember(
      ownerA.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const membershipB = await createMembership(
      org.id,
      ownerB.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
      { storeScopeMode: MembershipStoreScopeMode.ALL_STORES },
    );
    const membershipA = await prisma.organizationMembership.findUniqueOrThrow({
      where: { orgId_userId: { orgId: org.id, userId: ownerA.id } },
    });

    const results = await Promise.allSettled([
      service.suspendMembership(ownerA.id, org.id, membershipA.id),
      service.suspendMembership(ownerB.id, org.id, membershipB.id),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    await expectActiveOwnerCount(org.id, 1);
  });

  it("enforces store manager and store staff permission differences", async () => {
    const owner = await createUser("owner");
    const manager = await createUser("manager");
    const storeStaff = await createUser("store-staff");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const storeA = await createStore(org.id, "A");
    const storeB = await createStore(org.id, "B");
    await createMembership(
      org.id,
      manager.id,
      OrganizationMembershipRole.STORE_MANAGER,
      {
        storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
        storeIds: [storeA.id],
      },
    );
    await createMembership(
      org.id,
      storeStaff.id,
      OrganizationMembershipRole.STORE_STAFF,
      {
        storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
        storeIds: [storeA.id],
      },
    );

    await expect(
      service.updateStore(manager.id, org.id, storeA.id, { name: "A1" }),
    ).resolves.toMatchObject({ name: "A1" });
    await expectApiCode(
      service.updateStore(manager.id, org.id, storeB.id, { name: "B1" }),
      ORGANIZATION_ERROR_CODES.storeAccessDenied,
    );
    await expectApiCode(
      service.updateStore(storeStaff.id, org.id, storeA.id, { name: "A2" }),
      ORGANIZATION_ERROR_CODES.permissionDenied,
    );
    await expectApiCode(
      service.listMemberships(storeStaff.id, org.id, {}),
      ORGANIZATION_ERROR_CODES.permissionDenied,
    );
  });

  it("keeps platform roles separate from merchant memberships", async () => {
    const platformUser = await createUser("platform");
    const owner = await createUser("owner");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    await prisma.platformRoleAssignment.create({
      data: {
        id: createSelfxId(),
        userId: platformUser.id,
        role: PlatformRole.SELFX_SUPER_ADMIN,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
    });

    const visible = await service.listOrganizations(platformUser.id, {});
    expect(visible.data).toHaveLength(0);
    await expectApiCode(
      service.getOrganization(platformUser.id, org.id),
      ORGANIZATION_ERROR_CODES.organizationAccessDenied,
    );
  });

  it("uses database membership state rather than JWT role or scope claims", async () => {
    const owner = await createUser("owner");
    const staff = await createUser("staff");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    const storeA = await createStore(org.id, "A");
    const storeB = await createStore(org.id, "B");
    const membership = await createMembership(
      org.id,
      staff.id,
      OrganizationMembershipRole.STORE_STAFF,
      {
        storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
        storeIds: [storeA.id],
      },
    );

    await expectApiCode(
      service.getStore(staff.id, org.id, storeB.id),
      ORGANIZATION_ERROR_CODES.storeAccessDenied,
    );
    await service.updateMembership(owner.id, org.id, membership.id, {
      storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
      storeIds: [storeA.id, storeB.id],
    });
    await expect(
      service.getStore(staff.id, org.id, storeB.id),
    ).resolves.toMatchObject({
      id: storeB.id,
    });
    await service.suspendMembership(owner.id, org.id, membership.id);
    await expectApiCode(
      service.getStore(staff.id, org.id, storeA.id),
      ORGANIZATION_ERROR_CODES.membershipInactive,
    );
  });

  it("enforces pagination limits", async () => {
    const owner = await createUser("owner");
    const org = await createOrganizationWithMember(
      owner.id,
      OrganizationMembershipRole.ORGANIZATION_OWNER,
    );
    for (let index = 0; index < 27; index += 1) {
      await createStore(org.id, `store-${index}`);
    }

    const first = await service.listStores(owner.id, org.id, {});
    expect(first.data).toHaveLength(25);
    expect(first.pagination.hasMore).toBe(true);
    const second = await service.listStores(owner.id, org.id, {
      cursor: first.pagination.nextCursor ?? undefined,
      pageSize: 1000,
    });
    expect(second.data).toHaveLength(2);
  });

  it("validates DTO role, scope and status enums", async () => {
    const membership = Object.assign(new CreateMembershipDto(), {
      userId: "not-a-uuid",
      role: "OWNER",
      storeScopeMode: "EVERYTHING",
      storeIds: ["also-bad"],
    });
    const store = Object.assign(new UpdateStoreDto(), {
      status: "DELETED",
    });

    expect((await validate(membership)).map((error) => error.property)).toEqual(
      expect.arrayContaining(["userId", "role", "storeScopeMode", "storeIds"]),
    );
    expect((await validate(store)).map((error) => error.property)).toContain(
      "status",
    );
  });

  async function createUser(label: string) {
    const id = createSelfxId();
    userIds.push(id);
    return prisma.user.create({
      data: {
        id,
        email: `${label}-${id}@phase3b.test`,
        passwordHash: "not-used-in-phase-3b-tests",
        status: UserStatus.ACTIVE,
      },
    });
  }

  async function createOrganizationWithMember(
    userId: string,
    role: OrganizationMembershipRole,
    options: {
      status?: OrganizationStatus;
      membershipStatus?: MembershipStatus;
    } = {},
  ) {
    const id = createSelfxId();
    organizationIds.push(id);
    await prisma.organization.create({
      data: {
        id,
        name: `Phase 3B ${id}`,
        slug: `phase3b-${id}`,
        status: options.status ?? OrganizationStatus.ACTIVE,
      },
    });
    await createMembership(id, userId, role, {
      status: options.membershipStatus ?? MembershipStatus.ACTIVE,
      storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
    });
    return prisma.organization.findUniqueOrThrow({ where: { id } });
  }

  async function createStore(organizationId: string, name: string) {
    return prisma.store.create({
      data: {
        id: createSelfxId(),
        orgId: organizationId,
        name,
      },
    });
  }

  async function createMembership(
    organizationId: string,
    userId: string,
    role: OrganizationMembershipRole,
    options: {
      status?: MembershipStatus;
      storeScopeMode?: MembershipStoreScopeMode;
      storeIds?: string[];
    } = {},
  ) {
    const membership = await prisma.organizationMembership.create({
      data: {
        id: createSelfxId(),
        orgId: organizationId,
        userId,
        role,
        status: options.status ?? MembershipStatus.ACTIVE,
        storeScopeMode:
          options.storeScopeMode ?? MembershipStoreScopeMode.SELECTED_STORES,
        joinedAt: new Date(),
      },
    });
    for (const storeId of options.storeIds ?? []) {
      await prisma.membershipStoreScope.create({
        data: {
          id: createSelfxId(),
          orgId: organizationId,
          membershipId: membership.id,
          storeId,
        },
      });
    }
    return membership;
  }

  async function expectActiveOwnerCount(
    organizationId: string,
    expected: number,
  ): Promise<void> {
    await expect(
      prisma.organizationMembership.count({
        where: {
          orgId: organizationId,
          role: OrganizationMembershipRole.ORGANIZATION_OWNER,
          status: MembershipStatus.ACTIVE,
        },
      }),
    ).resolves.toBe(expected);
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
