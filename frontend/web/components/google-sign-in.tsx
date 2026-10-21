"use client";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, Button, Separator } from "@selfx/ui";
import { selfxApi, SafeApiError } from "@/lib/api";
import { safeLoginNextPath } from "@/lib/login-next";

export function GoogleSignIn({
  mode,
  disabled = false,
}: {
  mode: "login" | "signup";
  disabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void selfxApi<{ enabled: boolean }>("/api/v1/auth/google/config")
      .then((value) => {
        if (active) setEnabled(value.enabled);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  async function start() {
    if (busy || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const result = await selfxApi<{ authorizationUrl: string }>(
        "/api/v1/auth/google/start",
        {
          method: "POST",
          body: JSON.stringify({
            mode,
            next: safeLoginNextPath(
              new URLSearchParams(window.location.search).get("next"),
            ),
          }),
        },
      );
      const url = new URL(result.authorizationUrl);
      if (url.origin !== "https://accounts.google.com")
        throw new Error("Invalid Google sign-in destination");
      window.location.assign(url.href);
    } catch (caught) {
      setError(
        caught instanceof SafeApiError
          ? caught.message
          : "Google sign-in could not start. Try again.",
      );
      setBusy(false);
    }
  }
  if (!enabled) return null;
  return (
    <div
      className={
        mode === "login"
          ? "mt-4 space-y-3 lg:mt-3 lg:space-y-2"
          : "mb-4 space-y-3"
      }
    >
      {mode === "login" && (
        <div className="flex items-center gap-3">
          <Separator className="h-px min-w-0 flex-1" />
          <span className="text-xs text-muted-foreground">Or</span>
          <Separator className="h-px min-w-0 flex-1" />
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled || busy}
        onClick={() => void start()}
      >
        <svg aria-hidden="true" viewBox="0 0 18 18" className="size-4">
          <path
            fill="#4285F4"
            d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.258h2.909c1.702-1.567 2.683-3.875 2.683-6.615Z"
          />
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.468-.806 5.957-2.18l-2.909-2.258c-.806.54-1.837.859-3.048.859-2.344 0-4.328-1.583-5.036-3.71H.957v2.332A9 9 0 0 0 9 18Z"
          />
          <path
            fill="#FBBC05"
            d="M3.964 10.711A5.4 5.4 0 0 1 3.682 9c0-.594.102-1.17.282-1.711V4.957H.957A9 9 0 0 0 0 9c0 1.452.348 2.827.957 4.043l3.007-2.332Z"
          />
          <path
            fill="#EA4335"
            d="M9 3.58c1.321 0 2.508.455 3.441 1.346l2.582-2.582C13.464.891 11.426 0 9 0A9 9 0 0 0 .957 4.957l3.007 2.332C4.672 5.162 6.656 3.58 9 3.58Z"
          />
        </svg>
        {busy ? "Opening Google…" : "Continue with Google"}
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {mode === "signup" && (
        <p className="text-center text-xs text-muted-foreground">
          or continue with email
        </p>
      )}
    </div>
  );
}
