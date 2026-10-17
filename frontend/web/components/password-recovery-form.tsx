"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@selfx/ui";
import { SafeApiError, selfxApi } from "@/lib/api";
import { useSession } from "@/lib/session";

export function PasswordRecoveryForm({ reset = false }: { reset?: boolean }) {
  const session = useSession();
  const readToken = useRef(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [token, setToken] = useState(""),
    [ready, setReady] = useState(!reset);
  const [busy, setBusy] = useState(false),
    [done, setDone] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!reset || readToken.current) return;
    readToken.current = true;
    const value =
      new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
    // Keep the token in this form's memory, never browser storage or HTTP URLs.
    window.history.replaceState(null, "", window.location.pathname);
    if (/^[a-f0-9]{64}$/.test(value)) setToken(value);
    else setError("This reset link is invalid. Request a new link.");
    setReady(true);
  }, [reset]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (reset && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await selfxApi<{ message: string }>(
        `/api/v1/auth/${reset ? "reset-password" : "forgot-password"}`,
        {
          method: "POST",
          body: JSON.stringify(
            reset ? { token, password } : { email: email.trim() },
          ),
        },
      );
      if (reset) {
        setToken("");
        setPassword("");
        setConfirm("");
        await session.logout().catch(() => {});
      }
      setMessage(result.message);
      setDone(true);
    } catch (e) {
      setError(
        e instanceof SafeApiError
          ? e.message
          : "The request could not be completed. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{reset ? "Reset password" : "Forgot password"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">
            {reset
              ? "Choose a new password for your SelfX account."
              : "Enter your SelfX login email to receive a password reset link."}
          </p>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {done ? (
            <div role="status">
              <Alert>
                <AlertDescription>{message}</AlertDescription>
              </Alert>
            </div>
          ) : (
            <form
              onSubmit={(event) => void submit(event)}
              className="space-y-4"
            >
              {reset ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <Input
                      id="new-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={256}
                      required
                      value={password}
                      disabled={!ready || !token || busy}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-new-password">
                      Confirm password
                    </Label>
                    <Input
                      id="confirm-new-password"
                      type="password"
                      autoComplete="new-password"
                      minLength={12}
                      maxLength={256}
                      required
                      value={confirm}
                      disabled={!ready || !token || busy}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use at least 12 characters. Reset links expire after 15
                    minutes and can be used once.
                  </p>
                </>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="recovery-email">Login email</Label>
                  <Input
                    id="recovery-email"
                    type="email"
                    autoComplete="email"
                    maxLength={320}
                    required
                    value={email}
                    disabled={busy}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              )}
              <Button
                className="w-full"
                type="submit"
                disabled={busy || !ready || (reset && !token)}
              >
                {busy
                  ? "Please wait…"
                  : reset
                    ? "Reset password"
                    : "Send reset link"}
              </Button>
            </form>
          )}
          <div className="flex flex-wrap justify-between gap-3 text-sm">
            <Link href="/login">Back to sign in</Link>
            {reset ? (
              <Link href="/forgot-password">Request a new link</Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
