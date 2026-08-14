import { afterEach, describe, expect, it, vi } from "vitest";

import { createTryOnLabRun } from "@/lib/try-on-lab-api";

describe("Try-On Lab API routing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses same-origin API routing and preserves multipart FormData", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const formData = new FormData();
    formData.set("personImage", new Blob(["person"]), "person.jpg");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "run_1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await createTryOnLabRun(formData, "access-token");

    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/try-on-lab/runs",
      expect.objectContaining({
        method: "POST",
        body: formData,
        credentials: "include",
      }),
    );
    expect((init?.headers as Headers).get("Authorization")).toBe(
      "Bearer access-token",
    );
    expect((init?.headers as Headers).has("Content-Type")).toBe(false);
  });
});
