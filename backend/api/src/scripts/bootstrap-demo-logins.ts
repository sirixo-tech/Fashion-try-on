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
};

const PLATFORM_USERS: readonly DemoPlatformUser[] = [
  {
    email: "platform.superadmin@selfx.local",
    displayName: "SelfX Demo Super Admin",
    platformRole: PlatformRole.SELFX_SUPER_ADMIN,
  },
  {
    email: "platform.support@selfx.local",
    displayName: "SelfX Demo Support Admin",
    platformRole: PlatformRole.SELFX_SUPPORT_ADMIN,
  },
];

const MERCHANT_USERS: readonly DemoMerchantUser[] = [
  {
    email: "owner@selfx.local",
    displayName: "Demo Organization Owner",
    role: OrganizationMembershipRole.ORGANIZATION_OWNER,
    storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
  },
  {
    email: "org.admin@selfx.local",
    displayName: "Demo Organization Admin",
    role: OrganizationMembershipRole.ORGANIZATION_ADMIN,
    storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
  },
  {
    email: "org.staff@selfx.local",
    displayName: "Demo Organization Staff",
    role: OrganizationMembershipRole.ORGANIZATION_STAFF,
    storeScopeMode: MembershipStoreScopeMode.ALL_STORES,
  },
  {
    email: "store.owner@selfx.local",
    displayName: "Demo Store Owner",
    role: OrganizationMembershipRole.STORE_OWNER,
    storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
  },
  {
    email: "store.manager@selfx.local",
    displayName: "Demo Store Manager",
    role: OrganizationMembershipRole.STORE_MANAGER,
    storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
  },
  {
    email: "store.staff@selfx.local",
    displayName: "Demo Store Staff",
    role: OrganizationMembershipRole.STORE_STAFF,
    storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
  },
  {
    email: "kiosk.operator@selfx.local",
    displayName: "Demo Kiosk Operator",
    role: OrganizationMembershipRole.KIOSK_OPERATOR,
    storeScopeMode: MembershipStoreScopeMode.SELECTED_STORES,
  },
];

async function main() {
  if (process.env.SELFX_DEMO_LOGINS_BOOTSTRAP_ENABLED !== "true") {
    throw new Error("SELFX_DEMO_LOGINS_BOOTSTRAP_ENABLED must be true");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Demo login bootstrap is not allowed in production");
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
            joinedAt: new Date(),
          },
          update: {
            role: demoUser.role,
            storeScopeMode: demoUser.storeScopeMode,
            status: MembershipStatus.ACTIVE,
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
      }
    });

    console.log("Demo logins bootstrapped.");
    console.log(`Password: ${password}`);
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

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

void main();
