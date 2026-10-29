import { describe, expect, it, vi } from "vitest";
import { StoreCustomCreditQuoteController } from "./store-custom-credit-quote.controller.js";

describe("Store custom credit quotes", () => {
  it("requires Store-scoped authorization before reading a price", async () => {
    const plans = { quote: vi.fn() };
    const controller = new StoreCustomCreditQuoteController(
      { requireAccessUser: vi.fn().mockResolvedValue({ id: "user" }) } as never,
      {
        requireStoreResourcePermission: vi
          .fn()
          .mockRejectedValue(new Error("Denied")),
      } as never,
      { resolveStoreContext: vi.fn().mockResolvedValue({}) } as never,
      plans as never,
    );
    await expect(
      controller.quote(
        { headers: { authorization: "Bearer token" } } as never,
        "00000000-0000-4000-8000-000000000001",
        "10",
      ),
    ).rejects.toThrow("Denied");
    expect(plans.quote).not.toHaveBeenCalled();
  });
});
