"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { selfxApi } from "@/lib/api";

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

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionState>({
    status: "loading",
    user: null,
    accessToken: null,
  });

  const applyTokenResponse = useCallback((response: AuthTokenResponse) => {
    setSession({
      status: "authenticated",
      user: response.user,
      accessToken: response.accessToken,
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyTokenResponse(
        await selfxApi<AuthTokenResponse>("/api/v1/auth/refresh", {
          method: "POST",
        }),
      );
    } catch {
      setSession({
        status: "unauthenticated",
        user: null,
        accessToken: null,
      });
    }
  }, [applyTokenResponse]);

  const login = useCallback(
    async (email: string, password: string) => {
      applyTokenResponse(
        await selfxApi<AuthTokenResponse>("/api/v1/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        }),
      );
    },
    [applyTokenResponse],
  );

  const logout = useCallback(async () => {
    try {
      await selfxApi<{ ok: boolean }>("/api/v1/auth/logout", {
        method: "POST",
        accessToken:
          session.status === "authenticated" ? session.accessToken : null,
      });
    } finally {
      setSession({
        status: "unauthenticated",
        user: null,
        accessToken: null,
      });
    }
  }, [session]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
