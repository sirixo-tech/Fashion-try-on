import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import { Providers } from "@/app/providers";
import { SessionProvider } from "@/lib/session";
import { useSession, type StaffUser } from "@/lib/session";

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function useProductionApiProxy() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SELFX_API_BASE_URL", "");
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return {
    promise,
    resolve,
    reject,
  };
}

const staffUser: StaffUser = {
  id: "staff-1",
  email: "owner@example.test",
  displayName: "Owner",
  status: "ACTIVE",
};

function jsonResponse(body: unknown, status = 200): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function authResponse(accessToken: string, user = staffUser): FetchResponse {
  return jsonResponse({
    accessToken,
    accessTokenExpiresAt: "2026-08-15T12:00:00.000Z",
    user,
  });
}

function unauthorizedResponse(): FetchResponse {
  return jsonResponse(
    {
      error: {
        code: "AUTH_UNAUTHORIZED",
        message: "Refresh session is invalid or expired.",
      },
    },
    401,
  );
}

function StatusProbe() {
  const session = useSession();

  return (
    <>
      <p data-testid="session-status">{session.status}</p>
      <p data-testid="access-token">{session.accessToken ?? "none"}</p>
      <p data-testid="user-email">{session.user?.email ?? "none"}</p>
    </>
  );
}

function ConcurrentRefreshProbe() {
  const session = useSession();
  const [result, setResult] = useState("idle");

  return (
    <>
      <StatusProbe />
      <button
        type="button"
        onClick={() => {
          setResult("pending");
          void Promise.all([
            session.refresh(),
            session.refresh(),
            session.refresh(),
          ]).then(() => setResult("done"));
        }}
      >
        Refresh together
      </button>
      <p data-testid="refresh-result">{result}</p>
    </>
  );
}

function LoginProbe() {
  const session = useSession();

  return (
    <>
      <StatusProbe />
      <button
        type="button"
        onClick={() => {
          void session.login("login@example.test", "password");
        }}
      >
        Login
      </button>
    </>
  );
}

function LogoutRaceProbe() {
  const session = useSession();

  return (
    <>
      <StatusProbe />
      <button
        type="button"
        onClick={() => {
          void session.refresh();
        }}
      >
        Refresh
      </button>
      <button
        type="button"
        onClick={() => {
          void session.logout();
        }}
      >
        Logout
      </button>
    </>
  );
}

function ProviderLifecycleProbe() {
  const [route, setRoute] = useState<"login" | "app">("login");

  return (
    <Providers>
      <button type="button" onClick={() => setRoute("app")}>
        Go app
      </button>
      <p data-testid="route">{route}</p>
      <StatusProbe />
    </Providers>
  );
}

describe("SessionProvider", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("restores an existing valid refresh session with one request", async () => {
    useProductionApiProxy();
    const fetchMock = vi.fn().mockResolvedValue(authResponse("access-token-1"));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionProvider>
        <StatusProbe />
      </SessionProvider>,
    );

    expect(screen.getByTestId("session-status").textContent).toBe("loading");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("session-status").textContent).toBe(
        "authenticated",
      ),
    );
    expect(screen.getByTestId("access-token").textContent).toBe(
      "access-token-1",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/auth/refresh",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });

  it("shares one in-flight refresh promise across concurrent callers", async () => {
    useProductionApiProxy();
    let refreshRequests = 0;
    const secondRefresh = createDeferred<FetchResponse>();
    const fetchMock = vi.fn((input: string | URL | Request) => {
      if (String(input).includes("/api/v1/auth/refresh")) {
        refreshRequests += 1;

        if (refreshRequests === 1) {
          return Promise.resolve(authResponse("initial-token"));
        }

        return secondRefresh.promise;
      }

      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionProvider>
        <ConcurrentRefreshProbe />
      </SessionProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("session-status").textContent).toBe(
        "authenticated",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh together" }));

    await waitFor(() => expect(refreshRequests).toBe(2));
    expect(screen.getByTestId("refresh-result").textContent).toBe("pending");

    await act(async () => {
      secondRefresh.resolve(authResponse("shared-token"));
      await secondRefresh.promise;
    });

    await waitFor(() =>
      expect(screen.getByTestId("refresh-result").textContent).toBe("done"),
    );
    expect(screen.getByTestId("access-token").textContent).toBe(
      "shared-token",
    );
    expect(refreshRequests).toBe(2);
  });

  it("keeps a successful login when an older refresh fails later", async () => {
    useProductionApiProxy();
    const pendingRefresh = createDeferred<FetchResponse>();
    const loginUser: StaffUser = {
      ...staffUser,
      id: "staff-login",
      email: "login@example.test",
    };
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);

      if (path.includes("/api/v1/auth/refresh")) {
        return pendingRefresh.promise;
      }

      if (path.includes("/api/v1/auth/login")) {
        return Promise.resolve(authResponse("login-token", loginUser));
      }

      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionProvider>
        <LoginProbe />
      </SessionProvider>,
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Login" }));

    await waitFor(() =>
      expect(screen.getByTestId("access-token").textContent).toBe(
        "login-token",
      ),
    );

    await act(async () => {
      pendingRefresh.resolve(unauthorizedResponse());
      await pendingRefresh.promise;
    });

    await waitFor(() =>
      expect(screen.getByTestId("session-status").textContent).toBe(
        "authenticated",
      ),
    );
    expect(screen.getByTestId("user-email").textContent).toBe(
      "login@example.test",
    );
  });

  it("marks the session unauthenticated for a confirmed invalid refresh token", async () => {
    useProductionApiProxy();
    const fetchMock = vi.fn().mockResolvedValue(unauthorizedResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionProvider>
        <StatusProbe />
      </SessionProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("session-status").textContent).toBe(
        "unauthenticated",
      ),
    );
  });

  it("does not let a late refresh re-authenticate after logout", async () => {
    useProductionApiProxy();
    let refreshRequests = 0;
    const lateRefresh = createDeferred<FetchResponse>();
    const fetchMock = vi.fn((input: string | URL | Request) => {
      const path = String(input);

      if (path.includes("/api/v1/auth/refresh")) {
        refreshRequests += 1;

        if (refreshRequests === 1) {
          return Promise.resolve(authResponse("initial-token"));
        }

        return lateRefresh.promise;
      }

      if (path.includes("/api/v1/auth/logout")) {
        return Promise.resolve(jsonResponse({ ok: true }));
      }

      return Promise.resolve(jsonResponse({ ok: true }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <SessionProvider>
        <LogoutRaceProbe />
      </SessionProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("access-token").textContent).toBe(
        "initial-token",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    await waitFor(() => expect(refreshRequests).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "Logout" }));

    await waitFor(() =>
      expect(screen.getByTestId("session-status").textContent).toBe(
        "unauthenticated",
      ),
    );

    await act(async () => {
      lateRefresh.resolve(authResponse("late-token"));
      await lateRefresh.promise;
    });

    await waitFor(() =>
      expect(screen.getByTestId("session-status").textContent).toBe(
        "unauthenticated",
      ),
    );
    expect(screen.getByTestId("access-token").textContent).toBe("none");
  });

  it("keeps one provider lifecycle across login and app route content", async () => {
    useProductionApiProxy();
    const fetchMock = vi.fn().mockResolvedValue(authResponse("root-token"));
    vi.stubGlobal("fetch", fetchMock);

    render(<ProviderLifecycleProbe />);

    await waitFor(() =>
      expect(screen.getByTestId("session-status").textContent).toBe(
        "authenticated",
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Go app" }));

    expect(screen.getByTestId("route").textContent).toBe("app");
    expect(screen.getByTestId("access-token").textContent).toBe("root-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
