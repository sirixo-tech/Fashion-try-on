import {
  MembershipStatus,
  MembershipStoreScopeMode,
  OrganizationMembershipRole,
  OrganizationStatus,
  PlatformRole,
  PlatformRoleAssignmentStatus,
  Prisma,
  PrismaClient,
  StoreStatus,
  UserStatus,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { normalizeEmail } from "../auth/auth.service.js";
import { PasswordService } from "../auth/password.service.js";
import { loadSelfxEnv } from "../config/load-env.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";

loadSelfxEnv();

type DemoPlatformUser = {
  email: string;
  displayName: string;
  platformRole: PlatformRole;
};

type DemoMerchantUser = {
  email: string;
  displayName: string;
  role: OrganizationMembershipRole;
  storeScopeMode: MembershipStoreScopeMode;
  storeRoleSystemCode: string;
};

const PLATFORM_USERS: readonly DemoPlatformUser[] = [
  {
    email: "super-admin@selfx.local",
    displayName: "SelfX Demo Super Admin",
    platformRole: PlatformRole.SELFX_SUPER_ADMIN,
  },
  {
    email: "platform-staff-admin@selfx.local",
    displayName: "SelfX Demo Staff Admin",
    platformRole: PlatformRole.SELFX_STAFF_ADMIN,
  },
  {
    email: "support-admin@selfx.local",
    displayName: "SelfX Demo Support Admin",
    platformRole: PlatformRole.SELFX_SUPPORT_ADMIN,
  },
];

const MERCHANT_USERS: readonly DemoMerchantUser[] = [
  {
    email: "store-owner@selfx.local",
    displayName: "Demo Store Owner",
    role: OrganizationMembershipRole.ORGANIZATION_OWNER,
    storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
    storeRoleSystemCode: "store-admin",
  },
  {
    email: "store-admin@selfx.local",
    displayName: "Demo Store Admin",
    role: OrganizationMembershipRole.ORGANIZATION_ADMIN,
    storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
    storeRoleSystemCode: "store-admin",
  },
  {
    email: "store-manager@selfx.local",
    displayName: "Demo Store Manager",
    role: OrganizationMembershipRole.STORE_MANAGER,
    storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
    storeRoleSystemCode: "manager",
  },
  {
    email: "store-staff@selfx.local",
    displayName: "Demo Store Staff",
    role: OrganizationMembershipRole.STORE_STAFF,
    storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
    storeRoleSystemCode: "staff",
  },
];

async function main() {
  if (process.env.SELFX_DEMO_LOGINS_BOOTSTRAP_ENABLED !== "true") {
    throw new Error("SELFX_DEMO_LOGINS_BOOTSTRAP_ENABLED must be true");
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SELFX_ALLOW_DEPLOYED_DEMO_LOGINS !== "true"
  ) {
    throw new Error(
      "Demo login bootstrap is not allowed in production unless SELFX_ALLOW_DEPLOYED_DEMO_LOGINS is true",
    );
  }

  const password = required("SELFX_DEMO_LOGIN_PASSWORD");
  const organizationName =
    process.env.SELFX_DEMO_ORGANIZATION_NAME ?? "SelfX Demo Retail";
  const organizationSlug =
    process.env.SELFX_DEMO_ORGANIZATION_SLUG ?? "selfx-demo-retail";
  const storeName = process.env.SELFX_DEMO_STORE_NAME ?? "SelfX Demo Store";
  const storeCode = process.env.SELFX_DEMO_STORE_CODE ?? "main";

  const prisma = new PrismaClient();
  const passwords = new PasswordService();
  const rbac = new StoreRbacService(prisma as never);
  const passwordHash = await passwords.hashPassword(password);

  try {
    await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.upsert({
        where: { slug: organizationSlug },
        create: {
          id: createSelfxId(),
          name: organizationName,
          slug: organizationSlug,
          status: OrganizationStatus.ACTIVE,
          settings: { demo: true },
        },
        update: {
          name: organizationName,
          status: OrganizationStatus.ACTIVE,
          settings: { demo: true },
        },
      });

      const store = await tx.store.upsert({
        where: {
          orgId_code: {
            orgId: organization.id,
            code: storeCode,
          },
        },
        create: {
          id: createSelfxId(),
          orgId: organization.id,
          name: storeName,
          code: storeCode,
          status: StoreStatus.ACTIVE,
        },
        update: {
          name: storeName,
          status: StoreStatus.ACTIVE,
        },
      });
      await rbac.ensureStoreRbacInTransaction(tx, organization.id, true);

      for (const demoUser of PLATFORM_USERS) {
        const user = await upsertUser(tx, demoUser, passwordHash);

        await tx.platformRoleAssignment.upsert({
          where: {
            userId_role: {
              userId: user.id,
              role: demoUser.platformRole,
            },
          },
          create: {
            id: createSelfxId(),
            userId: user.id,
            role: demoUser.platformRole,
            status: PlatformRoleAssignmentStatus.ACTIVE,
          },
          update: {
            status: PlatformRoleAssignmentStatus.ACTIVE,
            revokedAt: null,
          },
        });
      }

      for (const demoUser of MERCHANT_USERS) {
        const user = await upsertUser(tx, demoUser, passwordHash);
        const joinedAt = new Date();
        const membership = await tx.organizationMembership.upsert({
          where: {
            orgId_userId: {
              orgId: organization.id,
              userId: user.id,
            },
          },
          create: {
            id: createSelfxId(),
            orgId: organization.id,
            userId: user.id,
            role: demoUser.role,
            storeScopeMode: demoUser.storeScopeMode,
            status: MembershipStatus.ACTIVE,
            joinedAt,
            suspendedAt: null,
          },
          update: {
            role: demoUser.role,
            storeScopeMode: demoUser.storeScopeMode,
            status: MembershipStatus.ACTIVE,
            joinedAt,
            suspendedAt: null,
          },
        });

        if (
          demoUser.storeScopeMode === MembershipStoreScopeMode.SELECTED_STORES
        ) {
          await tx.membershipStoreScope.upsert({
            where: {
              membershipId_storeId: {
                membershipId: membership.id,
                storeId: store.id,
              },
            },
            create: {
              id: createSelfxId(),
              orgId: organization.id,
              membershipId: membership.id,
              storeId: store.id,
            },
            update: {},
          });
        } else {
          await tx.membershipStoreScope.deleteMany({
            where: { membershipId: membership.id },
          });
        }

        await assignStoreRoleForMembership(tx, {
          storeTenantId: organization.id,
          membershipId: membership.id,
          systemCode: demoUser.storeRoleSystemCode,
        });
      }
    });

    console.log("Demo logins bootstrapped.");
    console.log("All demo accounts use SELFX_DEMO_LOGIN_PASSWORD.");
    if (process.env.NODE_ENV === "production") {
      console.log(
        "Production demo override was enabled. Disable SELFX_DEMO_LOGINS_BOOTSTRAP_ENABLED and SELFX_ALLOW_DEPLOYED_DEMO_LOGINS after verification.",
      );
    }
    for (const user of PLATFORM_USERS) {
      console.log(`${user.platformRole}: ${user.email}`);
    }
    for (const user of MERCHANT_USERS) {
      console.log(`${user.role}: ${user.email}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function upsertUser(
  tx: Prisma.TransactionClient,
  input: { email: string; displayName: string },
  passwordHash: string,
) {
  const email = normalizeEmail(input.email);

  return tx.user.upsert({
    where: { email },
    create: {
      id: createSelfxId(),
      email,
      displayName: input.displayName,
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
    update: {
      displayName: input.displayName,
      passwordHash,
      status: UserStatus.ACTIVE,
      emailVerifiedAt: new Date(),
    },
  });
}

async function assignStoreRoleForMembership(
  tx: Prisma.TransactionClient,
  input: {
    storeTenantId: string;
    membershipId: string;
    systemCode: string;
  },
) {
  const role = await tx.storeRole.findUnique({
    where: {
      orgId_systemCode: {
        orgId: input.storeTenantId,
        systemCode: input.systemCode,
      },
    },
    select: { id: true },
  });
  if (!role) {
    throw new Error(`Demo Store role not found: ${input.systemCode}`);
  }

  await tx.storeMembershipRole.deleteMany({
    where: {
      membershipId: input.membershipId,
      roleId: { not: role.id },
    },
  });
  await tx.storeMembershipRole.upsert({
    where: {
      membershipId_roleId: {
        membershipId: input.membershipId,
        roleId: role.id,
      },
    },
    create: {
      id: createSelfxId(),
      orgId: input.storeTenantId,
      membershipId: input.membershipId,
      roleId: role.id,
    },
    update: {},
  });
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

void main();
