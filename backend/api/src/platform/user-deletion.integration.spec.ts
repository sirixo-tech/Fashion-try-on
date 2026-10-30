import "reflect-metadata";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { PrismaService } from "../database/prisma.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { UsersService } from "./users.service.js";
import { PasswordService } from "../auth/password.service.js";
import { UserDeletionService } from "./user-deletion.service.js";
import { StorePurgeService } from "../stores/store-purge.service.js";
import { ObjectStorageService } from "../storage/object-storage.js";
import { AccessControlService } from "./access-control.service.js";

const url = process.env.USER_DELETION_TEST_DATABASE_URL;
if (
  url &&
  (!["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
    new URL(url).pathname !== "/selfx_user_deletion_test")
)
  throw new Error(
    "Only the disposable selfx_user_deletion_test database is allowed.",
  );
describe.skipIf(!url)(
  "User deletion, five roles and permanent Store deletion — PostgreSQL",
  () => {
    const db = new PrismaClient({
      datasourceUrl: url ?? "postgresql://unused@localhost/unused_test",
    });
    const rbac = new StoreRbacService(db as PrismaService),
      users = new UsersService(
        db as PrismaService,
        new PasswordService(),
        rbac,
      );
    const deletion = new UserDeletionService(db as PrismaService, rbac);
    const storage = { deleteObject: vi.fn().mockResolvedValue(undefined) };
    const purge = new StorePurgeService(
      db as PrismaService,
      storage as unknown as ObjectStorageService,
    );
    let superId: string,
      adminId: string,
      staffId: string,
      otherId: string,
      standaloneId: string,
      storeId: string,
      secondId: string;
    let staffMemberId: string, adminRole: string, staffRole: string;
    const code = (value: string) => ({ response: { error: { code: value } } });
    async function clear() {
      // Dedicated empty test database, never production or the developer's DB.
      await db.$executeRawUnsafe(
        "TRUNCATE organizations, users, kiosk_devices, deleted_store_objects RESTART IDENTITY CASCADE",
      );
      await db.auditLog.deleteMany();
      vi.clearAllMocks();
    }
    beforeAll(() => db.$connect());
    beforeEach(async () => {
      await clear();
      [superId, adminId, staffId, otherId, standaloneId] = [
        createSelfxId(),
        createSelfxId(),
        createSelfxId(),
        createSelfxId(),
        createSelfxId(),
      ];
      await db.user.createMany({
        data: [superId, adminId, staffId, otherId, standaloneId].map(
          (id, i) => ({
            id,
            email: `deletion-${i}@example.invalid`,
            displayName: [
              "Platform Super",
              "Store Admin",
              "Staff Person",
              "Shared Person",
              "Standalone Person",
            ][i],
            passwordHash: "test-hash",
          }),
        ),
      });
      await db.platformRoleAssignment.create({
        data: {
          id: createSelfxId(),
          userId: superId,
          role: "SELFX_SUPER_ADMIN",
        },
      });
      [storeId, secondId] = [createSelfxId(), createSelfxId()];
      await db.organization.createMany({
        data: [storeId, secondId].map((id, i) => ({
          id,
          name: i ? "Other Store" : "Avinash stores",
          slug: `purge-${id}`,
          status: "ACTIVE",
        })),
      });
      await rbac.ensureStoreRbac(storeId);
      await rbac.ensureStoreRbac(secondId);
      const roles = await db.storeRole.findMany({ where: { orgId: storeId } });
      adminRole = roles.find((r) => r.systemCode === "store-admin")!.id;
      staffRole = roles.find((r) => r.systemCode === "staff")!.id;
      const permissions = await db.permission.findMany({
        select: { id: true },
      });
      await db.storePermissionGrant.createMany({
        data: permissions.map((p) => ({
          id: createSelfxId(),
          storeTenantId: storeId,
          permissionId: p.id,
        })),
      });
      await membership(adminId, storeId, true);
      staffMemberId = (await membership(staffId)).id;
    });
    afterAll(async () => {
      await clear();
      await db.$disconnect();
    });
    async function membership(id: string, tenant = storeId, admin = false) {
      const role =
        tenant === storeId
          ? admin
            ? adminRole
            : staffRole
          : (
              await db.storeRole.findUniqueOrThrow({
                where: {
                  orgId_systemCode: {
                    orgId: tenant,
                    systemCode: admin ? "store-admin" : "staff",
                  },
                },
              })
            ).id;
      return db.organizationMembership.create({
        data: {
          id: createSelfxId(),
          userId: id,
          orgId: tenant,
          role: admin ? "ORGANIZATION_OWNER" : "STORE_STAFF",
          status: "ACTIVE",
          storeScopeMode: "ALL_STORES",
          roleAssignments: { create: { id: createSelfxId(), roleId: role } },
        },
      });
    }
    async function deleteInput(id: string) {
      const user = await users.get(id);
      return { version: user.version, confirmEmail: user.email };
    }
    async function memberInput(id = staffMemberId) {
      const member = await db.organizationMembership.findUniqueOrThrow({
        where: { id },
        include: { user: true },
      });
      return {
        updatedAt: member.updatedAt.toISOString(),
        confirmEmail: member.user.email,
      };
    }
    async function purgeInput() {
      const s = await db.organization.findUniqueOrThrow({
        where: { id: storeId },
      });
      return { confirmName: s.name, updatedAt: s.updatedAt.toISOString() };
    }
    it("soft deletes Store users, retains details, invalidates sessions and hides them by default", async () => {
      await db.userSession.create({
        data: {
          id: createSelfxId(),
          userId: staffId,
          refreshTokenHash: "refresh",
          expiresAt: new Date(Date.now() + 100000),
        },
      });
      await deletion.deleteAccount(
        superId,
        staffId,
        await deleteInput(staffId),
      );
      const user = await users.get(staffId);
      expect(user).toMatchObject({
        email: "deletion-2@example.invalid",
        displayName: "Staff Person",
        status: "DISABLED",
      });
      expect(user.deletedAt).toBeTruthy();
      expect(await db.userSession.count({ where: { userId: staffId } })).toBe(
        0,
      );
      expect(
        (await users.list({ page: 1, pageSize: 25 })).data.some(
          (u) => u.id === staffId,
        ),
      ).toBe(false);
      expect(
        (await users.list({ page: 1, pageSize: 25, deleted: "only" })).data.map(
          (u) => u.id,
        ),
      ).toEqual([staffId]);
      expect(
        (
          await db.organizationMembership.findUniqueOrThrow({
            where: { id: staffMemberId },
          })
        ).deletedAt,
      ).toBeTruthy();
    });
    it("hard deletes users without any Store and snapshots their historical identity", async () => {
      await db.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: standaloneId,
          action: "PAST_ACTION",
          resourceType: "user",
        },
      });
      const result = await deletion.deleteAccount(
        superId,
        standaloneId,
        await deleteInput(standaloneId),
      );
      expect(result.kind).toBe("HARD");
      expect(
        await db.user.findUnique({ where: { id: standaloneId } }),
      ).toBeNull();
      const event = await db.auditLog.findFirstOrThrow({
        where: { action: "PAST_ACTION" },
      });
      expect(event.actorUserId).toBeNull();
      expect(event.actorSnapshot).toMatchObject({
        displayName: "Standalone Person",
        email: "deletion-4@example.invalid",
        label: "Standalone Person (Deleted user)",
      });
    });
    it("forbids deletion by staff, self-deletion and Superadmin removal", async () => {
      await expect(
        deletion.deleteAccount(
          staffId,
          standaloneId,
          await deleteInput(standaloneId),
        ),
      ).rejects.toMatchObject(code("PLATFORM_PERMISSION_DENIED"));
      await expect(
        deletion.deleteAccount(superId, superId, await deleteInput(superId)),
      ).rejects.toMatchObject(code("USER_SELF_DELETE_BLOCKED"));
      await db.platformRoleAssignment.create({
        data: {
          id: createSelfxId(),
          userId: otherId,
          role: "SELFX_SUPER_ADMIN",
        },
      });
      await expect(
        deletion.deleteAccount(superId, otherId, await deleteInput(otherId)),
      ).rejects.toMatchObject(code("SELFX_SUPERADMIN_PROTECTED"));
    });
    it("requires exact identity confirmation and fresh versions", async () => {
      const input = await deleteInput(staffId);
      await expect(
        deletion.deleteAccount(superId, staffId, {
          ...input,
          confirmEmail: "wrong@example.invalid",
        }),
      ).rejects.toMatchObject(code("USER_DELETE_CONFIRMATION_REQUIRED"));
      await db.user.update({
        where: { id: staffId },
        data: { displayName: "Changed" },
      });
      await expect(
        deletion.deleteAccount(superId, staffId, input),
      ).rejects.toMatchObject(code("USER_EDIT_CONFLICT"));
    });
    it("protects the last Store Admin, including admins assigned through RBAC", async () => {
      await expect(
        deletion.deleteAccount(superId, adminId, await deleteInput(adminId)),
      ).rejects.toMatchObject(code("STORE_FINAL_ADMIN_PROTECTED"));
      await db.organizationMembership.updateMany({
        where: { userId: adminId },
        data: { role: "STORE_STAFF" },
      });
      await expect(
        deletion.deleteAccount(superId, adminId, await deleteInput(adminId)),
      ).rejects.toMatchObject(code("STORE_FINAL_ADMIN_PROTECTED"));
    });
    it("removes only one Store link for a shared user", async () => {
      await membership(staffId, secondId);
      const result = await deletion.deleteStoreMember(
        adminId,
        storeId,
        staffMemberId,
        await memberInput(),
      );
      expect(result.sharedAccountPreserved).toBe(true);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: staffId } })).status,
      ).toBe("ACTIVE");
      expect(
        (
          await db.organizationMembership.findUniqueOrThrow({
            where: { orgId_userId: { orgId: secondId, userId: staffId } },
          })
        ).status,
      ).toBe("ACTIVE");
      const shared = await users.get(staffId);
      await expect(
        users.assignFirstOwner(superId, staffId, {
          version: shared.version,
          storeId,
          confirmStoreName: "Avinash stores",
        }),
      ).rejects.toMatchObject(code("USER_DELETED"));
    });
    it("soft deletes an exclusive staff account when its Store Admin removes it", async () => {
      await deletion.deleteStoreMember(
        adminId,
        storeId,
        staffMemberId,
        await memberInput(),
      );
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: staffId } })).deletedAt,
      ).toBeTruthy();
    });
    it("prevents cross-Store deletion and peer Admin deletion", async () => {
      await membership(otherId, secondId, true);
      await expect(
        deletion.deleteStoreMember(
          otherId,
          storeId,
          staffMemberId,
          await memberInput(),
        ),
      ).rejects.toMatchObject(code("STORE_PERMISSION_DENIED"));
      const peer = await membership(otherId, storeId, true);
      await expect(
        deletion.deleteStoreMember(
          adminId,
          storeId,
          peer.id,
          await memberInput(peer.id),
        ),
      ).rejects.toMatchObject(code("STORE_ADMIN_PROTECTED"));
    });
    it("does not allow reactivating deleted accounts or memberships", async () => {
      await deletion.deleteAccount(
        superId,
        staffId,
        await deleteInput(staffId),
      );
      const user = await users.get(staffId);
      await expect(
        users.update(superId, staffId, {
          version: user.version,
          email: user.email,
          displayName: user.displayName!,
          status: "ACTIVE",
          memberships: [],
        }),
      ).rejects.toMatchObject(code("USER_DELETED"));
      await expect(
        rbac.updateUserStatus(superId, storeId, staffMemberId, {
          status: "ACTIVE",
        }),
      ).rejects.toMatchObject(code("STORE_MEMBERSHIP_NOT_FOUND"));
      await expect(
        rbac.addUser(superId, secondId, { email: user.email, roleIds: [] }),
      ).rejects.toMatchObject(code("USER_DELETED"));
    });
    it("rechecks the shared Store Admin permission inside the deletion transaction", async () => {
      const permission = await db.globalStoreRolePermission.findFirstOrThrow({
        where: {
          role: { systemCode: "store-admin" },
          permission: { code: "users.deactivate" },
        },
      });
      await db.globalStoreRolePermission.delete({
        where: { id: permission.id },
      });
      const checkedBeforeRevocation = vi
        .spyOn(rbac, "requireStorePermission")
        .mockResolvedValueOnce(undefined);
      try {
        await expect(
          deletion.deleteStoreMember(
            adminId,
            storeId,
            staffMemberId,
            await memberInput(),
          ),
        ).rejects.toMatchObject(code("STORE_PERMISSION_DENIED"));
        expect(
          (
            await db.organizationMembership.findUniqueOrThrow({
              where: { id: staffMemberId },
            })
          ).deletedAt,
        ).toBeNull();
      } finally {
        checkedBeforeRevocation.mockRestore();
        await db.globalStoreRolePermission.create({ data: permission });
      }
    });
    it("permanently removes Store records and exclusive users, preserving shared/platform users and audit details", async () => {
      await membership(otherId, storeId);
      await membership(otherId, secondId);
      await membership(superId, storeId);
      await deletion.deleteAccount(
        superId,
        staffId,
        await deleteInput(staffId),
      );
      await db.auditLog.create({
        data: {
          id: createSelfxId(),
          actorUserId: staffId,
          organizationId: storeId,
          action: "OLD_STORE_ACTION",
          resourceType: "user",
        },
      });
      await db.storeTaxSettings.create({
        data: { organizationId: storeId, mode: "OFF", rateBasisPoints: 0 },
      });
      await db.organization.update({
        where: { id: storeId },
        data: { status: "ARCHIVED" },
      });
      const result = await purge.purge(superId, storeId, await purgeInput());
      expect(result.deletedUsers).toBe(2);
      expect(
        await db.organization.findUnique({ where: { id: storeId } }),
      ).toBeNull();
      expect(await db.user.findUnique({ where: { id: staffId } })).toBeNull();
      expect(await db.user.findUnique({ where: { id: adminId } })).toBeNull();
      expect(
        await db.user.findUnique({ where: { id: otherId } }),
      ).not.toBeNull();
      expect(
        await db.user.findUnique({ where: { id: superId } }),
      ).not.toBeNull();
      expect(
        await db.organizationMembership.count({
          where: { orgId: secondId, userId: otherId },
        }),
      ).toBe(1);
      const audit = await db.auditLog.findFirstOrThrow({
        where: { action: "OLD_STORE_ACTION" },
      });
      expect(audit.actorSnapshot).toMatchObject({
        label: "Staff Person (Deleted user)",
      });
      expect(audit.metadata).toMatchObject({
        deleted_store: { name: "Avinash stores" },
      });
    }, 30000);
    it("deletes shopping/billing/catalog data, revokes fleet devices and queues image cleanup", async () => {
      const categoryId = createSelfxId(),
        productId = createSelfxId(),
        kioskId = createSelfxId(),
        sessionId = createSelfxId(),
        cartId = createSelfxId(),
        orderId = createSelfxId();
      await db.productCategory.create({
        data: {
          id: categoryId,
          organizationId: storeId,
          scope: "STORE",
          catalogKey: categoryId,
          slug: "tops",
          name: "Tops",
        },
      });
      await db.product.create({
        data: {
          id: productId,
          catalogKey: productId,
          organizationId: storeId,
          scope: "STORE",
          categoryId,
          name: "Shirt",
          slug: productId,
          audience: "UNISEX",
          garmentIntent: "TOP",
          garmentCategory: "TOP",
          imageStorageKey: "stores/test/shirt.png",
        },
      });
      await db.productStockSettings.create({
        data: {
          productId,
          organizationId: storeId,
          optionMode: "SIZE",
          pricingMode: "CONSTANT",
        },
      });
      await db.kioskDevice.create({
        data: {
          id: kioskId,
          displayName: "Store kiosk",
          assignmentScope: "ORGANIZATION",
          organizationId: storeId,
          status: "ACTIVE",
        },
      });
      await db.kioskDeviceSession.create({
        data: {
          id: createSelfxId(),
          kioskDeviceId: kioskId,
          refreshTokenHash: "old-kiosk",
          expiresAt: new Date(Date.now() + 100000),
        },
      });
      await db.tryOnSession.create({
        data: {
          id: sessionId,
          kioskDeviceId: kioskId,
          assignmentScope: "ORGANIZATION",
          organizationId: storeId,
          expiresAt: new Date(Date.now() + 100000),
        },
      });
      await db.shoppingCart.create({
        data: {
          id: cartId,
          organizationId: storeId,
          kioskDeviceId: kioskId,
          sessionId,
        },
      });
      await db.shoppingOrder.create({
        data: {
          id: orderId,
          reference: "TEST-ORDER-DELETE",
          organizationId: storeId,
          kioskDeviceId: kioskId,
          sourceCartId: cartId,
          currency: "INR",
          taxMode: "OFF",
          subtotalCents: 100,
          taxCents: 0,
          totalCents: 100,
          expiresAt: new Date(Date.now() + 100000),
        },
      });
      const plan = await db.pricingPlan.upsert({
        where: { code: "deletion-test-plan" },
        create: {
          id: createSelfxId(),
          code: "deletion-test-plan",
          name: "Test PAYG",
          channels: ["KIOSK"],
          billingMode: "POSTPAID_PAYG",
          creditUnitPriceCents: 100,
          trialCredits: 0,
        },
        update: {},
      });
      const subscriptionId = createSelfxId(),
        cycleId = createSelfxId();
      await db.storeSubscription.create({
        data: {
          id: subscriptionId,
          organizationId: storeId,
          pricingPlanId: plan.id,
          channels: ["KIOSK"],
        },
      });
      await db.storeBillingCycle.create({
        data: {
          id: cycleId,
          organizationId: storeId,
          subscriptionId,
          pricingPlanId: plan.id,
          periodStart: new Date("2026-10-01T00:00:00Z"),
          periodEnd: new Date("2026-11-01T00:00:00Z"),
          currency: "INR",
          creditUnitPriceCents: 100,
        },
      });
      await db.billableGeneration.create({
        data: {
          id: createSelfxId(),
          organizationId: storeId,
          runId: createSelfxId(),
          coverage: "POSTPAID",
          billingCycleId: cycleId,
          completedAt: new Date(),
        },
      });
      await db.organization.update({
        where: { id: storeId },
        data: { status: "ARCHIVED" },
      });
      await purge.purge(superId, storeId, await purgeInput());
      expect(await db.product.count({ where: { id: productId } })).toBe(0);
      expect(await db.shoppingOrder.count({ where: { id: orderId } })).toBe(0);
      expect(
        await db.storeSubscription.count({
          where: { organizationId: storeId },
        }),
      ).toBe(0);
      expect(
        await db.storeBillingCycle.count({
          where: { organizationId: storeId },
        }),
      ).toBe(0);
      expect(
        await db.billableGeneration.count({
          where: { organizationId: storeId },
        }),
      ).toBe(0);
      expect(
        await db.pricingPlan.findUnique({ where: { id: plan.id } }),
      ).not.toBeNull();
      expect(
        await db.kioskDevice.findUnique({ where: { id: kioskId } }),
      ).toMatchObject({
        organizationId: null,
        status: "REVOKED",
        assignmentScope: "PLATFORM",
      });
      expect(
        (
          await db.kioskDeviceSession.findFirstOrThrow({
            where: { kioskDeviceId: kioskId },
          })
        ).revokedAt,
      ).toBeTruthy();
      expect(
        await db.deletedStoreObject.findUnique({
          where: { storageKey: "stores/test/shirt.png" },
        }),
      ).not.toBeNull();
      await purge.cleanObjects();
      expect(storage.deleteObject).toHaveBeenCalledWith(
        "stores/test/shirt.png",
      );
    }, 30000);
    it("purges only the selected Store's payment probes and snapshots their audit counts", async () => {
      const tests = [storeId, secondId, null].map((tenant, index) => {
        const id = createSelfxId();
        return {
          id,
          provider: "PHONEPE",
          environment: "UAT",
          scopeKey: tenant ? `STORE:${tenant}` : "PLATFORM_TEST",
          organizationId: tenant,
          connectionVersion: 1,
          createdById: superId,
          transactionId: `ST${id.replaceAll("-", "")}`,
          keyDigest: String(index).repeat(64),
          status: "PENDING",
          amountMinor: 100,
          currency: "INR",
          encryptedPayload: "fixture-not-a-real-ciphertext",
          initializationVector: "fixture-iv",
          authenticationTag: "fixture-tag",
          keyVersion: "fixture-v1",
          expiresAt: new Date(Date.now() + 300000),
        };
      });
      await db.platformPaymentTest.createMany({ data: tests });
      await db.platformPaymentTestEvent.createMany({
        data: tests.map((test) => ({
          id: createSelfxId(),
          testId: test.id,
          digest: "e".repeat(64),
          reportedStatus: "PENDING",
        })),
      });
      await db.organization.update({
        where: { id: storeId },
        data: { status: "ARCHIVED" },
      });
      await purge.purge(superId, storeId, await purgeInput());
      expect(
        await db.platformPaymentTest.count({ where: { id: tests[0]!.id } }),
      ).toBe(0);
      expect(
        await db.platformPaymentTestEvent.count({
          where: { testId: tests[0]!.id },
        }),
      ).toBe(0);
      expect(
        await db.platformPaymentTest.count({
          where: { id: { in: tests.slice(1).map((test) => test.id) } },
        }),
      ).toBe(2);
      expect(
        await db.platformPaymentTestEvent.count({
          where: { testId: { in: tests.slice(1).map((test) => test.id) } },
        }),
      ).toBe(2);
      const audit = await db.auditLog.findFirstOrThrow({
        where: { action: "STORE_PERMANENTLY_DELETED", resourceId: storeId },
      });
      expect(audit.metadata).toMatchObject({
        deleted_resources: {
          platform_payment_tests: 1,
          platform_payment_test_events: 1,
        },
      });
      expect(JSON.stringify(audit.metadata)).not.toContain(
        "fixture-not-a-real-ciphertext",
      );
    }, 30000);
    it("requires Superadmin permission and correct Store confirmation before purge", async () => {
      await expect(
        purge.purge(superId, storeId, await purgeInput()),
      ).rejects.toMatchObject(code("STORE_ARCHIVE_REQUIRED"));
      await db.organization.update({
        where: { id: storeId },
        data: { status: "ARCHIVED" },
      });
      const input = await purgeInput();
      await expect(purge.purge(adminId, storeId, input)).rejects.toMatchObject(
        code("PLATFORM_PERMISSION_DENIED"),
      );
      await expect(
        purge.purge(superId, storeId, { ...input, confirmName: "wrong" }),
      ).rejects.toMatchObject(code("STORE_DELETE_CONFIRMATION_REQUIRED"));
      expect(
        await db.organization.findUnique({ where: { id: storeId } }),
      ).not.toBeNull();
    });
    it("preserves referenced upload files and retries failed object deletion", async () => {
      const device = createSelfxId();
      await db.kioskDevice.create({
        data: {
          id: device,
          displayName: "Other Store kiosk",
          assignmentScope: "ORGANIZATION",
          organizationId: secondId,
        },
      });
      await db.kioskCustomerUploadSession.create({
        data: {
          id: createSelfxId(),
          kioskDeviceId: device,
          capabilityDigest: createSelfxId(),
          expiresAt: new Date(Date.now() + 100000),
          assetKey: "shared/upload.png",
        },
      });
      await db.deletedStoreObject.createMany({
        data: [
          { storageKey: "shared/upload.png" },
          { storageKey: "retry/upload.png" },
        ],
      });
      storage.deleteObject.mockRejectedValueOnce(
        new Error("Temporary storage failure"),
      );
      await purge.cleanObjects();
      expect(storage.deleteObject).not.toHaveBeenCalledWith(
        "shared/upload.png",
      );
      const pending = await db.deletedStoreObject.findUniqueOrThrow({
        where: { storageKey: "retry/upload.png" },
      });
      expect(pending.attempts).toBe(1);
      expect(pending.availableAt.getTime()).toBeGreaterThan(Date.now());
      await db.deletedStoreObject.update({
        where: { storageKey: pending.storageKey },
        data: { availableAt: new Date(0) },
      });
      await purge.cleanObjects();
      expect(await db.deletedStoreObject.count()).toBe(0);
    });
    it("exposes only two Store roles and the Staff operational permission set", async () => {
      const roles = await rbac.listRoles(storeId, { page: 1, pageSize: 25 });
      expect(roles.data.map((r) => r.systemCode).sort()).toEqual([
        "staff",
        "store-admin",
      ]);
      const staff = roles.data.find((r) => r.systemCode === "staff")!;
      expect(staff.permissions.map((p) => p.code)).toEqual(
        expect.arrayContaining([
          "products.manage",
          "kiosks.configure",
          "analytics.view",
        ]),
      );
      expect(staff.permissions.map((p) => p.code)).not.toContain(
        "stores.update",
      );
      expect(
        staff.permissions.some(
          (p) => p.module === "users" || p.module === "roles",
        ),
      ).toBe(false);
      expect(
        (await rbac.effectivePermissions(staffId, storeId)).permissions,
      ).not.toContain("users.deactivate");
      await expect(
        rbac.createRole(superId, storeId, { name: "Manager" }),
      ).rejects.toMatchObject(code("FIXED_ROLES_ONLY"));
      const access = new AccessControlService(db as PrismaService);
      expect(
        (await access.listPlatformRoles()).data.map((r) => r.name).sort(),
      ).toEqual(["Platform Admin", "Platform Staff"]);
      await expect(
        access.createPlatformRole(superId, { name: "Custom" }),
      ).rejects.toMatchObject(code("FIXED_ROLES_ONLY"));
    });
  },
);
