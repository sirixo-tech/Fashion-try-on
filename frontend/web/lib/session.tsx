"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { SafeApiError, selfxApi, setAuthSessionHooks } from "@/lib/api";

export type StaffUser = {
  id: string;
  email: string;
  displayName: string | null;
  status: string;
};

type AuthTokenResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: StaffUser;
};

type SessionState =
  | { status: "loading"; user: null; accessToken: null }
  | { status: "unauthenticated"; user: null; accessToken: null }
  | { status: "authenticated"; user: StaffUser; accessToken: string };

type SessionContextValue = SessionState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

const emptySession: SessionState = {
  status: "loading",
  user: null,
  accessToken: null,
};

function isInvalidRefreshSession(error: unknown): boolean {
  return (
    error instanceof SafeApiError &&
    (error.status === 401 ||
      error.code === "AUTH_UNAUTHORIZED" ||
      error.code === "AUTH_REFRESH_TOKEN_INVALID")
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>(emptySession);
  const sessionRef = useRef<SessionState>(emptySession);
  const operationVersionRef = useRef(0);
  const refreshInFlightRef = useRef<Promise<string | null> | null>(null);

  const setSessionState = useCallback((nextSession: SessionState) => {
    sessionRef.current = nextSession;
    setSession(nextSession);
  }, []);

  const applyTokenResponse = useCallback(
    (response: AuthTokenResponse) => {
      setSessionState({
        status: "authenticated",
        user: response.user,
        accessToken: response.accessToken,
      });
    },
    [setSessionState],
  );

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const refreshVersion = operationVersionRef.current;

    const refreshPromise = selfxApi<AuthTokenResponse>("/api/v1/auth/refresh", {
      method: "POST",
    })
      .then((response) => {
        if (operationVersionRef.current === refreshVersion) {
          applyTokenResponse(response);
          return response.accessToken;
        }
        return sessionRef.current.status === "authenticated"
          ? sessionRef.current.accessToken
          : null;
      })
      .catch((error: unknown) => {
        if (operationVersionRef.current !== refreshVersion) {
          return sessionRef.current.status === "authenticated"
            ? sessionRef.current.accessToken
            : null;
        }

        if (!isInvalidRefreshSession(error)) {
          if (sessionRef.current.status === "authenticated") {
            throw error;
          }
          setSessionState({
            status: "unauthenticated",
            user: null,
            accessToken: null,
          });
          return null;
        }

        setSessionState({
          status: "unauthenticated",
          user: null,
          accessToken: null,
        });
        console.debug("AUTH_SESSION_TERMINAL");
        return null;
      })
      .finally(() => {
        if (refreshInFlightRef.current === refreshPromise) {
          refreshInFlightRef.current = null;
        }
      });

    refreshInFlightRef.current = refreshPromise;

    return refreshPromise;
  }, [applyTokenResponse, setSessionState]);

  const refresh = useCallback(async () => {
    try {
      await refreshAccessToken();
    } catch {
      // Direct UI refresh attempts preserve the current authenticated state for
      // transient connectivity failures. Request callers receive their own error.
    }
  }, [refreshAccessToken]);

  const handleTerminalAuthFailure = useCallback(
    (accessToken: string | null) => {
      const current = sessionRef.current;
      if (
        current.status === "authenticated" &&
        accessToken &&
        current.accessToken === accessToken
      ) {
        setSessionState({
          status: "unauthenticated",
          user: null,
          accessToken: null,
        });
        console.debug("AUTH_SESSION_TERMINAL");
      }
    },
    [setSessionState],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const loginVersion = operationVersionRef.current + 1;
      operationVersionRef.current = loginVersion;

      try {
        const response = await selfxApi<AuthTokenResponse>(
          "/api/v1/auth/login",
          {
            method: "POST",
            body: JSON.stringify({ email, password }),
          },
        );

        if (operationVersionRef.current === loginVersion) {
          applyTokenResponse(response);
        }
      } catch (error) {
        if (
          operationVersionRef.current === loginVersion &&
          sessionRef.current.status === "loading"
        ) {
          setSessionState({
            status: "unauthenticated",
            user: null,
            accessToken: null,
          });
        }

        throw error;
      }
    },
    [applyTokenResponse, setSessionState],
  );

  const logout = useCallback(async () => {
    const logoutVersion = operationVersionRef.current + 1;
    operationVersionRef.current = logoutVersion;
    const currentSession = sessionRef.current;

    try {
      await selfxApi<{ ok: boolean }>("/api/v1/auth/logout", {
        method: "POST",
        accessToken:
          currentSession.status === "authenticated"
            ? currentSession.accessToken
            : null,
      });
    } finally {
      if (operationVersionRef.current === logoutVersion) {
        setSessionState({
          status: "unauthenticated",
          user: null,
          accessToken: null,
        });
      }
    }
  }, [setSessionState]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    setAuthSessionHooks({
      getAccessToken: () =>
        sessionRef.current.status === "authenticated"
          ? sessionRef.current.accessToken
          : null,
      refreshSession: refreshAccessToken,
      handleTerminalAuthFailure,
    });

    return () => setAuthSessionHooks(null);
  }, [handleTerminalAuthFailure, refreshAccessToken]);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...session,
      login,
      logout,
      refresh,
    }),
    [login, logout, refresh, session],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);

  if (!value) {
    throw new Error("useSession must be used within SessionProvider.");
  }

  return value;
}
