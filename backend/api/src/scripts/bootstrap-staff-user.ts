import { PrismaClient } from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { normalizeEmail } from "../auth/auth.service.js";
import { PasswordService } from "../auth/password.service.js";
import { loadSelfxEnv } from "../config/load-env.js";

loadSelfxEnv();

async function main() {
  if (process.env.SELFX_AUTH_BOOTSTRAP_ENABLED !== "true") {
    throw new Error("SELFX_AUTH_BOOTSTRAP_ENABLED must be true");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Staff bootstrap is not allowed in production");
  }

  const email = normalizeEmail(required("SELFX_BOOTSTRAP_STAFF_EMAIL"));
  const password = required("SELFX_BOOTSTRAP_STAFF_PASSWORD");
  const displayName = process.env.SELFX_BOOTSTRAP_STAFF_DISPLAY_NAME ?? null;

  const prisma = new PrismaClient();
  const passwords = new PasswordService();

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`Staff user already exists: ${email}`);
      return;
    }

    const userCount = await prisma.user.count();
    if (userCount > 0) {
      throw new Error(
        "Refusing to bootstrap another user because users already exist",
      );
    }

    await prisma.user.create({
      data: {
        id: createSelfxId(),
        email,
        displayName,
        passwordHash: await passwords.hashPassword(password),
      },
    });
    console.log(`Staff user bootstrapped: ${email}`);
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
