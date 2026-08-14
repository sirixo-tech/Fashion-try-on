import { afterEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

import { SessionProvider } from "@/lib/session";

describe("SessionProvider", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("attempts refresh on mount so reloads can restore sessions", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        error: {
          code: "AUTH_UNAUTHORIZED",
          message: "Refresh session is invalid or expired.",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionProvider>
        <div>SelfX</div>
      </SessionProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });
});
