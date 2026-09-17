import { afterEach, describe, expect, it, vi } from "vitest";

import { EntitlementsService } from "../entitlements/entitlements.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { PrismaAuthRepository } from "./auth.repository.js";

describe("Self-service Store creation used by Shopify onboarding", () => {
  afterEach(() => vi.restoreAllMocks());

  it("creates active Store and owner access with Starter credits without a platform activation step", async () => {
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "owner-1" }),
      },
      organization: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "store-1" }),
      },
      organizationMembership: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const rbac = vi
      .spyOn(StoreRbacService.prototype, "ensureStoreRbacInTransaction")
      .mockResolvedValue();
    const trial = vi
      .spyOn(EntitlementsService.prototype, "ensureTrialCredits")
      .mockResolvedValue();
    await new PrismaAuthRepository(prisma as never).createSelfServeSignup({
      email: "owner@example.com",
      displayName: "New Merchant",
      passwordHash: "existing-hash",
      metadata: { source: "SHOPIFY" },
    });
    expect(tx.organization.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "ACTIVE" }),
    });
    expect(tx.organizationMembership.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "store-1",
        userId: "owner-1",
        role: "ORGANIZATION_OWNER",
        status: "ACTIVE",
        storeScopeMode: "ALL_STORES",
      }),
    });
    expect(rbac).toHaveBeenCalledWith(tx, "store-1", true);
    expect(trial).toHaveBeenCalledWith("store-1", tx);
  });

  it("does not overwrite existing owners or reactivate their Stores", async () => {
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "existing-owner" }),
        create: vi.fn(),
      },
      organization: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: unknown) => unknown) =>
        callback(tx),
      ),
    };
    const result = await new PrismaAuthRepository(
      prisma as never,
    ).createSelfServeSignup({
      email: "owner@example.com",
      displayName: "New Merchant",
      passwordHash: "new-hash",
    });
    expect(result).toBeNull();
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.organization.create).not.toHaveBeenCalled();
  });
});
