import {
  PlatformRole,
  PlatformRoleAssignmentStatus,
  PrismaClient,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { normalizeEmail } from "../auth/auth.service.js";
import { loadSelfxEnv } from "../config/load-env.js";

loadSelfxEnv();

async function main() {
  if (process.env.SELFX_PLATFORM_BOOTSTRAP_ENABLED !== "true") {
    throw new Error("SELFX_PLATFORM_BOOTSTRAP_ENABLED must be true");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Platform admin bootstrap is not allowed in production");
  }

  const email = normalizeEmail(required("SELFX_PLATFORM_BOOTSTRAP_EMAIL"));
  const prisma = new PrismaClient();

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new Error(`No existing user found for ${email}`);
    }

    await prisma.platformRoleAssignment.upsert({
      where: {
        userId_role: {
          userId: user.id,
          role: PlatformRole.SELFX_SUPER_ADMIN,
        },
      },
      create: {
        id: createSelfxId(),
        userId: user.id,
        role: PlatformRole.SELFX_SUPER_ADMIN,
        status: PlatformRoleAssignmentStatus.ACTIVE,
      },
      update: {
        status: PlatformRoleAssignmentStatus.ACTIVE,
        revokedAt: null,
      },
    });

    console.log(`Platform role assigned: ${email} -> SELFX_SUPER_ADMIN`);
  } finally {
    await prisma.$disconnect();
  }
}

function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

void main();
