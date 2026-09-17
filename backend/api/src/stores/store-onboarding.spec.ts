import { HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { describe, expect, it, vi } from "vitest";

import { PasswordService } from "../auth/password.service.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PLATFORM_PERMISSIONS } from "../platform/platform-permissions.js";
import { AdminStoresController } from "./admin-stores.controller.js";
import { AdminStoresService } from "./admin-stores.service.js";
import { OnboardAdminStoreDto } from "./dto/admin-store.dto.js";

const input = {
  name: "New Store",
  slug: "new-store",
  ownerName: "Store Owner",
  ownerEmail: "owner@example.com",
  ownerPassword: "OwnerPassword123!",
  pricingPlanId: "01994741-c000-7000-8000-000000000001",
};

function setup() {
  const persisted: unknown[] = [];
  const tx = {
    organization: {
      create: vi.fn(async ({ data }) => {
        const store = { ...data, createdAt: new Date(), updatedAt: new Date() };
        persisted.push(store);
        return store;
      }),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }) => {
        persisted.push(data);
        return { id: data.id };
      }),
    },
    organizationMembership: {
      create: vi.fn(async ({ data }) => {
        persisted.push(data);
        return data;
      }),
    },
    auditLog: {
      create: vi.fn(async ({ data }) => {
        persisted.push(data);
        return data;
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(async (callback) => {
      const before = persisted.length;
      try {
        return await callback(tx);
      } catch (error) {
        persisted.splice(before);
        throw error;
      }
    }),
  };
  const rbac = { ensureStoreRbacInTransaction: vi.fn() };
  const entitlements = {
    activatePlanForStore: vi
      .fn()
      .mockResolvedValue({ availableCredits: 110, subscription: null }),
  };
  const service = new AdminStoresService(
    prisma as never,
    {} as never,
    rbac as never,
    {} as never,
    undefined,
    entitlements as never,
  );
  return { service, prisma, tx, rbac, entitlements, persisted };
}

describe("Store onboarding", () => {
  it("creates an active owner and plan in the same transaction, hashes credentials and audits only identifiers", async () => {
    const { service, prisma, tx, rbac, entitlements } = setup();
    const response = await service.onboardStore(
      { ...input, ownerEmail: " OWNER@example.com " },
      "admin-1",
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "ACTIVE" }),
    });
    const owner = tx.user.create.mock.calls[0]![0].data;
    expect(owner).toMatchObject({
      email: "owner@example.com",
      status: "ACTIVE",
      displayName: "Store Owner",
    });
    expect(owner.passwordHash).toMatch(/^\$argon2id\$/);
    expect(
      await new PasswordService().verifyPassword(
        owner.passwordHash,
        input.ownerPassword,
      ),
    ).toBe(true);
    expect(tx.organizationMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: response.id,
        userId: owner.id,
        role: "ORGANIZATION_OWNER",
        status: "ACTIVE",
        storeScopeMode: "ALL_STORES",
      }),
    });
    expect(rbac.ensureStoreRbacInTransaction).toHaveBeenCalledWith(
      tx,
      response.id,
      true,
    );
    expect(entitlements.activatePlanForStore).toHaveBeenCalledWith(
      { organizationId: response.id, pricingPlanId: input.pricingPlanId },
      tx,
    );
    expect(response).toMatchObject({
      status: "ACTIVE",
      subscription: { availableCredits: 110 },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUserId: "admin-1",
        action: "STORE_ONBOARDED",
      }),
    });
    expect(
      JSON.stringify([response, tx.auditLog.create.mock.calls]),
    ).not.toContain(input.ownerPassword);
    expect(
      JSON.stringify([response, tx.auditLog.create.mock.calls]),
    ).not.toContain(owner.passwordHash);
  });

  it("never modifies or links an existing user by email", async () => {
    const { service, tx, persisted } = setup();
    tx.user.findUnique.mockResolvedValue({ id: "existing-user" });
    await expect(service.onboardStore(input, "admin-1")).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "STORE_OWNER_EMAIL_CONFLICT" } },
    });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.organization.create).not.toHaveBeenCalled();
    expect(tx.organizationMembership.create).not.toHaveBeenCalled();
    expect(persisted).toEqual([]);
  });

  it("rolls back owner and Store creation when plan activation fails", async () => {
    const { service, entitlements, tx, persisted } = setup();
    entitlements.activatePlanForStore.mockRejectedValue(
      new ApiErrorException(
        HttpStatus.CONFLICT,
        "PRICING_PLAN_UNAVAILABLE",
        "Plan unavailable.",
      ),
    );
    await expect(service.onboardStore(input, "admin-1")).rejects.toMatchObject({
      status: 409,
    });
    expect(tx.user.create).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).not.toHaveBeenCalled();
    expect(persisted).toEqual([]);
  });

  it("maps concurrent email uniqueness conflicts without replacing credentials", async () => {
    const { service, tx, persisted } = setup();
    tx.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["email"] },
      }),
    );
    await expect(service.onboardStore(input, "admin-1")).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "STORE_OWNER_EMAIL_CONFLICT" } },
    });
    expect(persisted).toEqual([]);
  });

  it("validates credentials and selected plan before the service is invoked", async () => {
    expect(
      await validate(plainToInstance(OnboardAdminStoreDto, input)),
    ).toEqual([]);
    const errors = await validate(
      plainToInstance(OnboardAdminStoreDto, {
        ...input,
        name: " ",
        ownerName: " ",
        ownerEmail: "invalid",
        ownerPassword: "short",
        pricingPlanId: "invalid",
      }),
    );
    expect(errors.map((error) => error.property).sort()).toEqual([
      "name",
      "ownerEmail",
      "ownerName",
      "ownerPassword",
      "pricingPlanId",
    ]);
  });

  it.each([
    PLATFORM_PERMISSIONS.storesCreate,
    PLATFORM_PERMISSIONS.pricingManage,
  ])("requires %s before any onboarding write", async (denied) => {
    const stores = { onboardStore: vi.fn() };
    const authorization = {
      requirePermission: vi.fn(async (_user, permission) => {
        if (permission === denied)
          throw new ApiErrorException(
            403,
            "PLATFORM_PERMISSION_DENIED",
            "Denied.",
          );
      }),
    };
    const controller = new AdminStoresController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "admin-1" }),
      } as never,
      authorization as never,
      stores as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      controller.onboard(
        { headers: { authorization: "Bearer token" } } as never,
        input,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(stores.onboardStore).not.toHaveBeenCalled();
  });

  it("attributes successful onboarding to the authenticated platform actor", async () => {
    const stores = {
      onboardStore: vi.fn().mockResolvedValue({ id: "store-1" }),
    };
    const controller = new AdminStoresController(
      {
        requireAccessUser: vi.fn().mockResolvedValue({ id: "admin-1" }),
      } as never,
      { requirePermission: vi.fn() } as never,
      stores as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await controller.onboard(
      { headers: { authorization: "Bearer token" } } as never,
      input,
    );
    expect(stores.onboardStore).toHaveBeenCalledWith(input, "admin-1");
  });
});
