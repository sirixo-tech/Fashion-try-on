import {
  PlatformRole,
  PlatformRoleAssignmentStatus,
  UserStatus,
} from "@prisma/client";

import { createSelfxId } from "@selfx/database";

import { normalizeEmail } from "../auth/auth.service.js";

export const PRODUCTION_ADMIN_BOOTSTRAP_CONFIRM =
  "CREATE_FIRST_SUPER_ADMIN";

export class ProductionAdminBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionAdminBootstrapError";
  }
}

export interface ProductionAdminBootstrapConfig {
  email: string;
  password: string;
  displayName: string | null;
}

export interface ProductionAdminBootstrapResult {
  status: "created" | "already_initialized";
  email: string;
}

interface PasswordHasher {
  hashPassword(password: string): Promise<string>;
}

interface BootstrapUserRecord {
  id: string;
  email: string;
  status: UserStatus;
}

interface BootstrapPlatformRoleAssignmentRecord {
  status: PlatformRoleAssignmentStatus;
}

interface ProductionBootstrapTransaction {
  $executeRaw<T = unknown>(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T>;
  user: {
    count(): Promise<number>;
    findUnique(args: {
      where: { email: string };
      select: { id: true; email: true; status: true };
    }): Promise<BootstrapUserRecord | null>;
    create(args: {
      data: {
        id: string;
        email: string;
        displayName: string | null;
        passwordHash: string;
        status: UserStatus;
      };
      select: { id: true; email: true; status: true };
    }): Promise<BootstrapUserRecord>;
  };
  platformRoleAssignment: {
    findUnique(args: {
      where: {
        userId_role: {
          userId: string;
          role: PlatformRole;
        };
      };
      select: { status: true };
    }): Promise<BootstrapPlatformRoleAssignmentRecord | null>;
    create(args: {
      data: {
        id: string;
        userId: string;
        role: PlatformRole;
        status: PlatformRoleAssignmentStatus;
        assignedByUserId: null;
      };
    }): Promise<unknown>;
  };
}

export interface ProductionBootstrapDatabase {
  $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

export function readProductionAdminBootstrapConfig(
  env: NodeJS.ProcessEnv,
): ProductionAdminBootstrapConfig {
  if (env.NODE_ENV !== "production") {
    throw new ProductionAdminBootstrapError(
      "Production admin bootstrap requires NODE_ENV=production",
    );
  }
  if (env.SELFX_PRODUCTION_BOOTSTRAP_ENABLED !== "true") {
    throw new ProductionAdminBootstrapError(
      "SELFX_PRODUCTION_BOOTSTRAP_ENABLED must be true",
    );
  }
  if (
    env.SELFX_PRODUCTION_BOOTSTRAP_CONFIRM !==
    PRODUCTION_ADMIN_BOOTSTRAP_CONFIRM
  ) {
    throw new ProductionAdminBootstrapError(
      "SELFX_PRODUCTION_BOOTSTRAP_CONFIRM must be CREATE_FIRST_SUPER_ADMIN",
    );
  }

  return {
    email: normalizeEmail(requiredEnv(env, "SELFX_PRODUCTION_ADMIN_EMAIL")),
    password: requiredSecret(env, "SELFX_PRODUCTION_ADMIN_PASSWORD"),
    displayName: optionalTrimmed(env.SELFX_PRODUCTION_ADMIN_DISPLAY_NAME),
  };
}

export async function bootstrapProductionAdmin(input: {
  env: NodeJS.ProcessEnv;
  db: ProductionBootstrapDatabase;
  passwords: PasswordHasher;
}): Promise<ProductionAdminBootstrapResult> {
  const config = readProductionAdminBootstrapConfig(input.env);

  return input.db.$transaction(async (rawTx) => {
    const tx = rawTx as ProductionBootstrapTransaction;
    await acquireProductionBootstrapLock(tx);

    const userCount = await tx.user.count();
    if (userCount === 0) {
      return createFirstProductionAdmin(tx, input.passwords, config);
    }

    if (userCount === 1) {
      const existing = await tx.user.findUnique({
        where: { email: config.email },
        select: { id: true, email: true, status: true },
      });
      if (existing && (await hasActiveSuperAdminAssignment(tx, existing))) {
        return {
          status: "already_initialized",
          email: config.email,
        };
      }
    }

    throw new ProductionAdminBootstrapError(
      "Refusing production bootstrap because users already exist",
    );
  });
}

export function formatProductionAdminBootstrapResult(
  result: ProductionAdminBootstrapResult,
): string {
  if (result.status === "already_initialized") {
    return `Production platform administrator already initialized: ${result.email}`;
  }
  return `Production platform administrator bootstrapped: ${result.email}`;
}

async function createFirstProductionAdmin(
  tx: ProductionBootstrapTransaction,
  passwords: PasswordHasher,
  config: ProductionAdminBootstrapConfig,
): Promise<ProductionAdminBootstrapResult> {
  const user = await tx.user.create({
    data: {
      id: createSelfxId(),
      email: config.email,
      displayName: config.displayName,
      passwordHash: await passwords.hashPassword(config.password),
      status: UserStatus.ACTIVE,
    },
    select: { id: true, email: true, status: true },
  });

  await tx.platformRoleAssignment.create({
    data: {
      id: createSelfxId(),
      userId: user.id,
      role: PlatformRole.SELFX_SUPER_ADMIN,
      status: PlatformRoleAssignmentStatus.ACTIVE,
      assignedByUserId: null,
    },
  });

  return {
    status: "created",
    email: user.email,
  };
}

async function hasActiveSuperAdminAssignment(
  tx: ProductionBootstrapTransaction,
  user: BootstrapUserRecord,
): Promise<boolean> {
  if (user.status !== UserStatus.ACTIVE) {
    return false;
  }

  const assignment = await tx.platformRoleAssignment.findUnique({
    where: {
      userId_role: {
        userId: user.id,
        role: PlatformRole.SELFX_SUPER_ADMIN,
      },
    },
    select: { status: true },
  });

  return assignment?.status === PlatformRoleAssignmentStatus.ACTIVE;
}

async function acquireProductionBootstrapLock(
  tx: ProductionBootstrapTransaction,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(19781121, 20260814)`;
}

function requiredEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new ProductionAdminBootstrapError(`${key} is required`);
  }
  return value;
}

function requiredSecret(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || value.trim() === "") {
    throw new ProductionAdminBootstrapError(`${key} is required`);
  }
  return value;
}

function optionalTrimmed(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
