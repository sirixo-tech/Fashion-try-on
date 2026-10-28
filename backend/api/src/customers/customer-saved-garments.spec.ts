import { describe, expect, it, vi } from "vitest";
import { CustomerExperienceService } from "./customer-experience.service.js";

function subject() {
  const db = {
    customerStoreVisit: { findMany: vi.fn(async () => []) },
    product: { findFirst: vi.fn(async () => null), findMany: vi.fn(async () => []) },
    customerSavedGarment: {
      findMany: vi.fn(async () => []),
      upsert: vi.fn(async () => ({})),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  const service = new CustomerExperienceService(
    db as unknown as ConstructorParameters<typeof CustomerExperienceService>[0],
    {} as ConstructorParameters<typeof CustomerExperienceService>[1],
    {} as ConstructorParameters<typeof CustomerExperienceService>[2],
    {} as ConstructorParameters<typeof CustomerExperienceService>[3],
    {} as ConstructorParameters<typeof CustomerExperienceService>[4],
    {} as ConstructorParameters<typeof CustomerExperienceService>[5],
  );
  return { db, service };
}

describe("customer saved garments", () => {
  it("saves only published demo garments for the signed-in customer", async () => {
    const { db, service } = subject();
    await service.saveGarment("customer-1", { source: "DEMO", id: "terracotta-blazer" });
    expect(db.customerSavedGarment.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ customerId: "customer-1", sourceItemId: "terracotta-blazer" }),
      }),
    );
    await expect(service.saveGarment("customer-1", { source: "DEMO", id: "missing" })).rejects.toThrow();
  });

  it("rejects Store garments without an active visit and removes only the requesting customer's save", async () => {
    const { db, service } = subject();
    await expect(service.saveGarment("customer-1", {
      source: "STORE",
      id: "018f6a90-fd17-7b88-8f4a-f203ab246f32",
    })).rejects.toThrow();
    expect(db.customerSavedGarment.upsert).not.toHaveBeenCalled();
    await service.removeGarment("customer-1", "STORE", "018f6a90-fd17-7b88-8f4a-f203ab246f32");
    expect(db.customerSavedGarment.deleteMany).toHaveBeenCalledWith({
      where: { customerId: "customer-1", source: "STORE", sourceItemId: "018f6a90-fd17-7b88-8f4a-f203ab246f32" },
    });
  });
});
