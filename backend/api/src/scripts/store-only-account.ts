import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";

type Tx = Prisma.TransactionClient;
export interface AccountDatabase {
  $transaction<T>(
    callback: (tx: Tx) => Promise<T>,
    options?: {
      isolationLevel?: Prisma.TransactionIsolationLevel;
      timeout?: number;
    },
  ): Promise<T>;
}
export class StoreOnlyAccountError extends Error {}
export interface AccountSelection {
  targetEmail: string;
  remainingAdminEmail: string;
  storeSlug: string;
}
const action = "MAINTENANCE_STORE_ONLY_ACCOUNT";
const userSelect = { id: true, email: true, status: true } as const;

function fail(message: string): never {
  throw new StoreOnlyAccountError(message);
}
function email(value: string) {
  return value.trim().toLowerCase();
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function json<T>(value: T): T {
  // Artifacts deliberately exclude password hashes, tokens and connection strings.
  return JSON.parse(JSON.stringify(value)) as T;
}

async function requireRemainingAdmin(tx: Tx, address: string) {
  const admin = await tx.user.findUnique({
    where: { email: email(address) },
    select: userSelect,
  });
  if (!admin || admin.status !== "ACTIVE")
    fail("The remaining Superadmin must be an existing ACTIVE user.");
  const role = await tx.platformRoleAssignment.findFirst({
    where: { userId: admin.id, role: "SELFX_SUPER_ADMIN", status: "ACTIVE" },
    select: { id: true },
  });
  if (!role)
    fail("The remaining administrator is not an active protected Superadmin.");
  return admin;
}

async function buildPlan(
  tx: Tx,
  selection: AccountSelection,
  identity = { id: createSelfxId(), createdAt: new Date().toISOString() },
  env: NodeJS.ProcessEnv = process.env,
) {
  const admin = await requireRemainingAdmin(tx, selection.remainingAdminEmail);
  const target = await tx.user.findUnique({
    where: { email: email(selection.targetEmail) },
    select: userSelect,
  });
  if (!target || target.status !== "ACTIVE")
    fail("Target must be an existing ACTIVE user.");
  if (target.id === admin.id)
    fail("Target and remaining Superadmin must be different accounts.");
  const store = await tx.organization.findUnique({
    where: { slug: selection.storeSlug },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!store || store.status !== "ACTIVE")
    fail("Select an existing ACTIVE Store.");
  const membership = await tx.organizationMembership.findUnique({
    where: { orgId_userId: { orgId: store.id, userId: target.id } },
    select: {
      id: true,
      orgId: true,
      userId: true,
      role: true,
      status: true,
      storeScopeMode: true,
      updatedAt: true,
      roleAssignments: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          roleId: true,
          role: {
            select: {
              isActive: true,
              systemCode: true,
              permissions: {
                orderBy: { permissionId: "asc" },
                select: { permission: { select: { code: true } } },
              },
            },
          },
        },
      },
    },
  });
  if (
    !membership ||
    membership.status !== "ACTIVE" ||
    membership.role !== "ORGANIZATION_OWNER" ||
    membership.storeScopeMode !== "ALL_STORES"
  )
    fail(
      "Target must already be this Store's ACTIVE owner with ALL_STORES scope. This tool never creates or changes memberships.",
    );
  if (
    !membership.roleAssignments.some(
      (a) => a.role.isActive && a.role.systemCode === "store-admin",
    )
  )
    fail(
      "The owner needs an active Store Admin RBAC assignment. Review Store Users/Roles before retrying.",
    );
  const grants = await tx.storePermissionGrant.findMany({
    where: { storeTenantId: store.id },
    orderBy: { permissionId: "asc" },
    select: { permission: { select: { code: true } } },
  });
  const granted = new Set(grants.map((g) => g.permission.code));
  const storePermissions = [
    ...new Set(
      membership.roleAssignments
        .filter((a) => a.role.isActive)
        .flatMap((a) => a.role.permissions.map((p) => p.permission.code))
        .filter((code) => granted.has(code)),
    ),
  ].sort();
  if (!storePermissions.includes("stores.view"))
    fail(
      "The existing Store role/permission ceiling does not allow stores.view. Review Store permissions first.",
    );
  const staticRoles = await tx.platformRoleAssignment.findMany({
    where: { userId: target.id, status: "ACTIVE" },
    orderBy: { id: "asc" },
  });
  const customRoles = await tx.platformUserAccessRole.findMany({
    where: { userId: target.id, status: "ACTIVE" },
    orderBy: { id: "asc" },
  });
  if (!staticRoles.length && !customRoles.length)
    fail(
      "Target already has no active platform role assignments. No conversion is needed.",
    );
  const content = json({
    version: 1 as const,
    ...identity,
    railwayProjectId: env.RAILWAY_PROJECT_ID ?? null,
    railwayEnvironmentId: env.RAILWAY_ENVIRONMENT_ID ?? null,
    target,
    remainingAdmin: admin,
    store,
    membership,
    grants,
    storePermissions,
    staticRoles,
    customRoles,
  });
  return { ...content, hash: hash(content) };
}
export type StoreOnlyPlan = Awaited<ReturnType<typeof buildPlan>>;

export function validateAccountPlan(plan: StoreOnlyPlan, expectedHash: string) {
  if (
    !plan ||
    plan.version !== 1 ||
    !plan.target?.id ||
    !plan.remainingAdmin?.id ||
    !plan.store?.id ||
    !Array.isArray(plan.staticRoles) ||
    !Array.isArray(plan.customRoles)
  )
    fail("Invalid account plan artifact.");
  const { hash: digest, ...content } = plan;
  if (
    !/^[a-f0-9]{64}$/.test(expectedHash) ||
    digest !== expectedHash ||
    digest !== hash(content)
  )
    fail(
      "Plan confirmation does not match, or the artifact was edited. Generate a fresh preview.",
    );
}

export async function previewStoreOnlyAccount(
  db: AccountDatabase,
  selection: AccountSelection,
  env: NodeJS.ProcessEnv = process.env,
) {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return buildPlan(tx, selection, undefined, env);
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
}

export async function applyStoreOnlyAccount(input: {
  db: AccountDatabase;
  plan: StoreOnlyPlan;
  expectedHash: string;
  expectedUserId: string;
  expectedStoreId: string;
  writeBackup: (plan: StoreOnlyPlan) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}) {
  const { db, plan } = input;
  validateAccountPlan(plan, input.expectedHash);
  if (
    input.expectedUserId !== plan.target.id ||
    input.expectedStoreId !== plan.store.id
  )
    fail("Confirmed target user ID or Store ID does not match the preview.");
  const verify = async (tx: Tx) => {
    const admin = await requireRemainingAdmin(tx, plan.remainingAdmin.email);
    if (admin.id !== plan.remainingAdmin.id || admin.id === plan.target.id)
      fail("Remaining Superadmin identity changed.");
    const env = input.env ?? process.env;
    if (
      (env.RAILWAY_PROJECT_ID ?? null) !== plan.railwayProjectId ||
      (env.RAILWAY_ENVIRONMENT_ID ?? null) !== plan.railwayEnvironmentId
    )
      fail("Railway environment differs from the preview.");
    const previous = await tx.auditLog.findFirst({
      where: { action, resourceId: plan.id },
      select: { metadata: true },
    });
    if (previous) {
      const metadata = previous.metadata as Record<string, unknown> | null;
      if (metadata?.planHash !== plan.hash)
        fail("Operation ID conflicts with an existing audit record.");
      const active =
        (await tx.platformRoleAssignment.count({
          where: { userId: plan.target.id, status: "ACTIVE" },
        })) +
        (await tx.platformUserAccessRole.count({
          where: { userId: plan.target.id, status: "ACTIVE" },
        }));
      if (active)
        fail(
          "Platform access was assigned again after this operation. Review a new preview.",
        );
      return true;
    }
    const fresh = await buildPlan(
      tx,
      {
        targetEmail: plan.target.email,
        remainingAdminEmail: plan.remainingAdmin.email,
        storeSlug: plan.store.slug,
      },
      { id: plan.id, createdAt: plan.createdAt },
      env,
    );
    if (fresh.hash !== plan.hash)
      fail(
        "Account, roles, Store membership or permissions changed since preview. Generate a fresh preview.",
      );
    return false;
  };
  const completed = await db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      return verify(tx);
    },
    { isolationLevel: "RepeatableRead", timeout: 30_000 },
  );
  if (completed) return { status: "ALREADY_APPLIED" as const };
  // Failure to save the inverse role manifest must prevent any database change.
  await input.writeBackup(plan);
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      // Brief maintenance-only locks also protect against concurrent role grants,
      // owner changes, refreshes and impersonation starts from normal UI/API paths.
      await tx.$executeRaw`LOCK TABLE users, organizations, organization_memberships, platform_role_assignments, platform_user_roles, store_membership_roles, store_roles, store_role_permissions, store_permission_grants, user_sessions, impersonation_sessions IN SHARE ROW EXCLUSIVE MODE`;
      if (await verify(tx)) return { status: "ALREADY_APPLIED" as const };
      const now = new Date();
      const where = { userId: plan.target.id, status: "ACTIVE" as const };
      const staticRoles = await tx.platformRoleAssignment.updateMany({
        where,
        data: { status: "REVOKED", revokedAt: now },
      });
      const customRoles = await tx.platformUserAccessRole.updateMany({
        where,
        data: { status: "REVOKED", revokedAt: now },
      });
      const sessions = await tx.userSession.updateMany({
        where: { userId: plan.target.id, revokedAt: null },
        data: { revokedAt: now },
      });
      const impersonations = await tx.impersonationSession.updateMany({
        where: { actorUserId: plan.target.id, status: "ACTIVE" },
        data: { status: "ENDED", endedAt: now },
      });
      const result = {
        status: "APPLIED" as const,
        staticRolesRevoked: staticRoles.count,
        customRolesRevoked: customRoles.count,
        refreshSessionsRevoked: sessions.count,
        impersonationsEnded: impersonations.count,
      };
      await tx.auditLog.create({
        data: {
          id: createSelfxId(),
          action,
          actorUserId: plan.remainingAdmin.id,
          organizationId: plan.store.id,
          resourceType: "account_maintenance",
          resourceId: plan.id,
          metadata: json({
            planHash: plan.hash,
            targetUserId: plan.target.id,
            source: "explicit_database_maintenance_cli",
            before: plan,
            result,
          }) as unknown as Prisma.InputJsonValue,
        },
      });
      return result;
    },
    { timeout: 30_000 },
  );
}
