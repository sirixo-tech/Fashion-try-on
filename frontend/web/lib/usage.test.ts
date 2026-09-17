import { describe, expect, it, vi } from "vitest";
import { selfxApi } from "@/lib/api";
import { getUsageSummary } from "@/lib/usage";

vi.mock("@/lib/api", () => ({ selfxApi: vi.fn().mockResolvedValue({}) }));

describe("Store usage requests", () => {
  it("forwards explicit Store scope and custom billing dates", async () => {
    await getUsageSummary("token", {
      storeId: "store-a",
      range: "custom",
      limit: 5,
      from: "2026-09-01T00:00:00Z",
      to: "2026-09-17T00:00:00Z",
    });
    const [path, options] = vi.mocked(selfxApi).mock.calls.at(-1)!;
    const query = new URL(path, "https://selfx.test").searchParams;
    expect(query.get("storeId")).toBe("store-a");
    expect(query.get("range")).toBe("custom");
    expect(query.get("limit")).toBe("5");
    expect(query.get("from")).toBe("2026-09-01T00:00:00Z");
    expect(query.get("to")).toBe("2026-09-17T00:00:00Z");
    expect(options).toEqual({ accessToken: "token" });
  });
});
