import {
  PlatformRole,
  PlatformRoleAssignmentStatus,
  UserStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";

import { PasswordService } from "../auth/password.service.js";
import {
  bootstrapProductionAdmin,
  formatProductionAdminBootstrapResult,
  PRODUCTION_ADMIN_BOOTSTRAP_CONFIRM,
  type ProductionBootstrapDatabase,
} from "./production-admin-bootstrap.js";

const baseEnv = {
  NODE_ENV: "production",
  SELFX_PRODUCTION_BOOTSTRAP_ENABLED: "true",
  SELFX_PRODUCTION_BOOTSTRAP_CONFIRM: PRODUCTION_ADMIN_BOOTSTRAP_CONFIRM,
  SELFX_PRODUCTION_ADMIN_EMAIL: "Admin@SelfX.com ",
  SELFX_PRODUCTION_ADMIN_PASSWORD: "correct horse battery staple",
  SELFX_PRODUCTION_ADMIN_DISPLAY_NAME: " SelfX Admin ",
} satisfies NodeJS.ProcessEnv;

interface FakeUser {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  status: UserStatus;
}

interface FakeRoleAssignment {
  id: string;
  userId: string;
  role: PlatformRole;
  status: PlatformRoleAssignmentStatus;
  assignedByUserId: string | null;
}

class RecordingPasswordHasher {
  readonly inputs: string[] = [];

  async hashPassword(password: string): Promise<string> {
    this.inputs.push(password);
    return `hashed:${password}`;
  }
}

class FakeProductionBootstrapDatabase implements ProductionBootstrapDatabase {
  users: FakeUser[] = [];
  roleAssignments: FakeRoleAssignment[] = [];
  failRoleCreate = false;
  readonly operations: string[] = [];

  async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
    const txUsers = this.users.map((user) => ({ ...user }));
    const txRoleAssignments = this.roleAssignments.map((assignment) => ({
      ...assignment,
    }));
    const tx = this.createTransaction(txUsers, txRoleAssignments);
    const result = await fn(tx);
    this.users = txUsers;
    this.roleAssignments = txRoleAssignments;
    return result;
  }

  private createTransaction(
    txUsers: FakeUser[],
    txRoleAssignments: FakeRoleAssignment[],
  ) {
    return {
      $executeRaw: async () => {
        this.operations.push("lock");
        return 1;
      },
      user: {
        count: async () => {
          this.operations.push("count-users");
          return txUsers.length;
        },
        findUnique: async (args: { where: { email: string } }) =>
          txUsers.find((user) => user.email === args.where.email) ?? null,
        create: async (args: { data: FakeUser }) => {
          this.operations.push("create-user");
          txUsers.push({ ...args.data });
          return { ...args.data };
        },
      },
      platformRoleAssignment: {
        findUnique: async (args: {
          where: { userId_role: { userId: string; role: PlatformRole } };
        }) =>
          txRoleAssignments.find(
            (assignment) =>
              assignment.userId === args.where.userId_role.userId &&
              assignment.role === args.where.userId_role.role,
          ) ?? null,
        create: async (args: { data: FakeRoleAssignment }) => {
          this.operations.push("create-role");
          if (this.failRoleCreate) {
            throw new Error("role create failed");
          }
          txRoleAssignments.push({ ...args.data });
          return { ...args.data };
        },
      },
    };
  }
}

describe("bootstrapProductionAdmin", () => {
  it("refuses when NODE_ENV is not production", async () => {
    const db = new FakeProductionBootstrapDatabase();
    await expect(
      bootstrapProductionAdmin({
        env: { ...baseEnv, NODE_ENV: "development" },
        db,
        passwords: new RecordingPasswordHasher(),
      }),
    ).rejects.toThrow("Production admin bootstrap requires NODE_ENV=production");
    expect(db.operations).toEqual([]);
  });

  it("refuses when the production enable gate is absent", async () => {
    await expect(
      bootstrapProductionAdmin({
        env: {
          ...baseEnv,
          SELFX_PRODUCTION_BOOTSTRAP_ENABLED: "false",
        },
        db: new FakeProductionBootstrapDatabase(),
        passwords: new RecordingPasswordHasher(),
      }),
    ).rejects.toThrow("SELFX_PRODUCTION_BOOTSTRAP_ENABLED must be true");
  });

  it("refuses when the confirmation value is wrong", async () => {
    await expect(
      bootstrapProductionAdmin({
        env: {
          ...baseEnv,
          SELFX_PRODUCTION_BOOTSTRAP_CONFIRM: "WRONG",
        },
        db: new FakeProductionBootstrapDatabase(),
        passwords: new RecordingPasswordHasher(),
      }),
    ).rejects.toThrow(
      "SELFX_PRODUCTION_BOOTSTRAP_CONFIRM must be CREATE_FIRST_SUPER_ADMIN",
    );
  });

  it("refuses when users already exist in an incompatible state", async () => {
    const db = new FakeProductionBootstrapDatabase();
    db.users.push({
      id: "11111111-1111-7111-8111-111111111111",
      email: "someone@example.com",
      passwordHash: "existing-hash",
      displayName: null,
      status: UserStatus.ACTIVE,
    });

    await expect(
      bootstrapProductionAdmin({
        env: baseEnv,
        db,
        passwords: new RecordingPasswordHasher(),
      }),
    ).rejects.toThrow(
      "Refusing production bootstrap because users already exist",
    );
    expect(db.users).toHaveLength(1);
    expect(db.roleAssignments).toHaveLength(0);
  });

  it("creates the first user and active super-admin assignment together", async () => {
    const db = new FakeProductionBootstrapDatabase();
    const passwords = new RecordingPasswordHasher();

    const result = await bootstrapProductionAdmin({
      env: baseEnv,
      db,
      passwords,
    });

    expect(result).toEqual({
      status: "created",
      email: "admin@selfx.com",
    });
    expect(db.operations.slice(0, 2)).toEqual(["lock", "count-users"]);
    expect(db.users).toMatchObject([
      {
        email: "admin@selfx.com",
        displayName: "SelfX Admin",
        passwordHash: "hashed:correct horse battery staple",
        status: UserStatus.ACTIVE,
      },
    ]);
    expect(db.roleAssignments).toMatchObject([
      {
        userId: db.users[0]?.id,
        role: PlatformRole.SELFX_SUPER_ADMIN,
        status: PlatformRoleAssignmentStatus.ACTIVE,
        assignedByUserId: null,
      },
    ]);
    expect(passwords.inputs).toEqual(["correct horse battery staple"]);
  });

  it("hashes passwords with the existing PasswordService semantics", async () => {
    const db = new FakeProductionBootstrapDatabase();
    const passwords = new PasswordService();

    await bootstrapProductionAdmin({
      env: baseEnv,
      db,
      passwords,
    });

    const hash = db.users[0]?.passwordHash;
    expect(hash).toBeDefined();
    expect(hash).not.toBe(baseEnv.SELFX_PRODUCTION_ADMIN_PASSWORD);
    await expect(
      passwords.verifyPassword(
        hash ?? "",
        baseEnv.SELFX_PRODUCTION_ADMIN_PASSWORD,
      ),
    ).resolves.toBe(true);
  });

  it("rolls back the user when role assignment fails", async () => {
    const db = new FakeProductionBootstrapDatabase();
    db.failRoleCreate = true;

    await expect(
      bootstrapProductionAdmin({
        env: baseEnv,
        db,
        passwords: new RecordingPasswordHasher(),
      }),
    ).rejects.toThrow("role create failed");

    expect(db.users).toHaveLength(0);
    expect(db.roleAssignments).toHaveLength(0);
  });

  it("treats retry for the exact already-bootstrapped admin as a no-op", async () => {
    const db = new FakeProductionBootstrapDatabase();
    db.users.push({
      id: "11111111-1111-7111-8111-111111111111",
      email: "admin@selfx.com",
      passwordHash: "existing-hash",
      displayName: "SelfX Admin",
      status: UserStatus.ACTIVE,
    });
    db.roleAssignments.push({
      id: "22222222-2222-7222-8222-222222222222",
      userId: db.users[0]?.id ?? "",
      role: PlatformRole.SELFX_SUPER_ADMIN,
      status: PlatformRoleAssignmentStatus.ACTIVE,
      assignedByUserId: null,
    });
    const passwords = new RecordingPasswordHasher();

    const result = await bootstrapProductionAdmin({
      env: baseEnv,
      db,
      passwords,
    });

    expect(result).toEqual({
      status: "already_initialized",
      email: "admin@selfx.com",
    });
    expect(db.users).toHaveLength(1);
    expect(db.roleAssignments).toHaveLength(1);
    expect(passwords.inputs).toEqual([]);
  });

  it("does not reset password or mutate an existing incompatible user", async () => {
    const db = new FakeProductionBootstrapDatabase();
    db.users.push({
      id: "11111111-1111-7111-8111-111111111111",
      email: "admin@selfx.com",
      passwordHash: "existing-hash",
      displayName: "SelfX Admin",
      status: UserStatus.ACTIVE,
    });
    const passwords = new RecordingPasswordHasher();

    await expect(
      bootstrapProductionAdmin({
        env: baseEnv,
        db,
        passwords,
      }),
    ).rejects.toThrow(
      "Refusing production bootstrap because users already exist",
    );

    expect(db.users[0]?.passwordHash).toBe("existing-hash");
    expect(db.roleAssignments).toHaveLength(0);
    expect(passwords.inputs).toEqual([]);
  });

  it("does not include secrets in ordinary result or refusal messages", async () => {
    const secret = "do-not-print-this-password";
    const resultMessage = formatProductionAdminBootstrapResult({
      status: "created",
      email: "admin@selfx.com",
    });

    expect(resultMessage).not.toContain(secret);
    await expect(
      bootstrapProductionAdmin({
        env: {
          ...baseEnv,
          SELFX_PRODUCTION_BOOTSTRAP_CONFIRM: secret,
          SELFX_PRODUCTION_ADMIN_PASSWORD: secret,
        },
        db: new FakeProductionBootstrapDatabase(),
        passwords: new RecordingPasswordHasher(),
      }),
    ).rejects.not.toThrow(secret);
  });
});
