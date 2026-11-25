import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../database/prisma.service.js";
import type { TryOnSessionService } from "../try-on/try-on-session.service.js";
import type { TryOnExecutionService } from "../try-on/try-on-execution.service.js";
import type { ObjectStorageService } from "../storage/object-storage.js";
import type { EntitlementsService } from "../entitlements/entitlements.service.js";
import type { CatalogService } from "../catalog/catalog.service.js";
import {
  CustomerExperienceService,
  CUSTOMER_PHOTO_CONSENT_VERSION,
} from "./customer-experience.service.js";

describe("Mobile photo processing under saved policy acceptance", () => {
  const principal = { id: randomUUID(), securityVersion: 0 };
  const acceptedAt = new Date("2026-10-26T09:00:00Z");
  const account = {
    ...principal,
    status: "ACTIVE",
    termsVersion: "2026-10-26",
    termsAcceptedAt: acceptedAt,
  };
  const tx = {
    $queryRaw: vi.fn(),
    customer: { findUnique: vi.fn() },
    customerPhotoConsent: { create: vi.fn() },
  };
  const db = {
    $transaction: vi.fn(),
    customerStoreVisit: { findFirst: vi.fn() },
  };
  const sessions = { createSession: vi.fn() };
  let service: CustomerExperienceService;

  beforeEach(() => {
    vi.resetAllMocks();
    tx.$queryRaw.mockResolvedValue([]);
    tx.customer.findUnique.mockResolvedValue(account);
    tx.customerPhotoConsent.create.mockImplementation(async ({ data }) => ({
      ...data,
    }));
    db.$transaction.mockImplementation(async (work) => work(tx));
    sessions.createSession.mockResolvedValue({
      id: randomUUID(),
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    service = new CustomerExperienceService(
      db as unknown as PrismaService,
      sessions as unknown as TryOnSessionService,
      {} as TryOnExecutionService,
      {} as ObjectStorageService,
      {} as EntitlementsService,
      {} as CatalogService,
    );
    vi.spyOn(service, "available").mockResolvedValue(true);
  });

  it("uses the saved version and original acceptance date without claiming a new sheet action", async () => {
    const result = await service.createSession(principal, {});
    const data = tx.customerPhotoConsent.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      customerId: principal.id,
      version: account.termsVersion,
      acceptedAt,
      merchantResultAccess: false,
    });
    expect(data.statement).toContain(
      "previously accepted Terms and Privacy Policy",
    );
    expect(data.statement).toContain(acceptedAt.toISOString());
    expect(data.statement).toContain("within 7 days");
    expect(data.statement).toContain("within 30 days");
    expect(data.statement).not.toContain("Presentation language:");
    expect(data.statement).not.toContain("I allow");
    expect(sessions.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: principal.id,
        customerConsentId: data.id,
        assignmentScope: "PLATFORM",
        organizationId: null,
      }),
    );
    expect(result.payer).toBe("PERSONAL");
  });

  it("continues recording actual explicit acceptance from older app versions", async () => {
    await service.createSession(principal, {
      consentAccepted: true,
      consentVersion: CUSTOMER_PHOTO_CONSENT_VERSION,
      consentLanguage: "ar",
    });
    const data = tx.customerPhotoConsent.create.mock.calls[0]![0].data;
    expect(data.statement).toContain("I allow SelfX");
    expect(data.statement).toContain("Presentation language: ar");
    expect(data.statement).not.toContain("Consent basis:");
    expect(data).not.toHaveProperty("acceptedAt");
  });

  it.each([
    { consentAccepted: false, consentVersion: CUSTOMER_PHOTO_CONSENT_VERSION },
    { consentAccepted: true, consentVersion: "old" },
    { consentAccepted: true },
    { consentVersion: CUSTOMER_PHOTO_CONSENT_VERSION },
  ])(
    "rejects invalid explicit acceptance instead of silently treating it as policy acceptance: %j",
    async (input) => {
      await expect(service.createSession(principal, input)).rejects.toThrow();
      expect(tx.customerPhotoConsent.create).not.toHaveBeenCalled();
      expect(sessions.createSession).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: "DELETED" },
    { securityVersion: 1 },
    { termsVersion: "" },
    { termsAcceptedAt: null },
  ])(
    "does not create a consent record for an invalid account or missing acceptance: %j",
    async (changes) => {
      tx.customer.findUnique.mockResolvedValue({ ...account, ...changes });
      await expect(service.createSession(principal, {})).rejects.toThrow();
      expect(tx.customerPhotoConsent.create).not.toHaveBeenCalled();
      expect(sessions.createSession).not.toHaveBeenCalled();
    },
  );

  it("keeps Store sponsorship and result access scoped to the customer's valid visit", async () => {
    const visitId = randomUUID(),
      storeId = randomUUID();
    db.customerStoreVisit.findFirst.mockResolvedValue({
      id: visitId,
      qr: { organizationId: storeId, organization: { name: "Store" } },
    });
    const result = await service.createSession(principal, {
      storeVisitId: visitId,
    });
    expect(db.customerStoreVisit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: visitId,
          customerId: principal.id,
          endedAt: null,
        }),
      }),
    );
    const data = tx.customerPhotoConsent.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      storeVisitId: visitId,
      sponsoringStoreId: storeId,
      merchantResultAccess: true,
      acceptedAt,
    });
    expect(data.statement).toContain("original person photo remains private");
    expect(sessions.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customerStoreVisitId: visitId,
        organizationId: storeId,
      }),
    );
    expect(result.payer).toBe("STORE");
  });

  it("rejects an expired or another customer's Store visit before creating a consent record", async () => {
    db.customerStoreVisit.findFirst.mockResolvedValue(null);
    await expect(
      service.createSession(principal, { storeVisitId: randomUUID() }),
    ).rejects.toThrow();
    expect(tx.customerPhotoConsent.create).not.toHaveBeenCalled();
    expect(sessions.createSession).not.toHaveBeenCalled();
  });
});
