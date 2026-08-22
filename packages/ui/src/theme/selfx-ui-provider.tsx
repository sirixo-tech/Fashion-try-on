"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type SelfxTheme = "light" | "dark";

type SelfxThemeContextValue = {
  theme: SelfxTheme;
  setTheme: (theme: SelfxTheme) => void;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = "selfx-theme";
const SelfxThemeContext = createContext<SelfxThemeContextValue | null>(null);

function preferredTheme(): SelfxTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    return "light";
  }

  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function SelfxUiProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [theme, setThemeState] = useState<SelfxTheme>("light");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    setThemeState(preferredTheme());
    setInitialized(true);
  }, []);

  useEffect(() => {
    if (!initialized) {
      return;
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme switching should keep working even when storage is unavailable.
    }
  }, [initialized, theme]);

  const value = useMemo<SelfxThemeContextValue>(
    () => ({
      theme,
      setTheme: setThemeState,
      toggleTheme: () =>
        setThemeState((current) => (current === "dark" ? "light" : "dark")),
    }),
    [theme],
  );

  return (
    <SelfxThemeContext.Provider value={value}>
      {children}
    </SelfxThemeContext.Provider>
  );
}

export function useSelfxTheme(): SelfxThemeContextValue {
  const value = useContext(SelfxThemeContext);
  if (!value) {
    return {
      theme: "light",
      setTheme: () => undefined,
      toggleTheme: () => undefined,
    };
  }
  return value;
}
