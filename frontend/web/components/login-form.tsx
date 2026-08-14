"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, Button, Input, Label } from "@selfx/ui";

import { Signup2 } from "@/components/signup2";
import { SafeApiError } from "@/lib/api";
import { useSession } from "@/lib/session";

export function LoginForm() {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorCode(null);

    try {
      await session.login(email, password);
      router.push("/app/dashboard");
    } catch (error) {
      setErrorCode(
        error instanceof SafeApiError ? error.code : "REQUEST_FAILED",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Signup2
      description="Access the SelfX staff and platform administration workspace."
      footer="New organization access is handled through the approved SelfX onboarding flow."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="selfx-login-email">Email</Label>
          <Input
            id="selfx-login-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="selfx-login-password">Password</Label>
          <Input
            id="selfx-login-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
        </div>
        {errorCode ? (
          <Alert variant="destructive">
            <AlertDescription>Sign in failed: {errorCode}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? "Signing in" : "Sign in"}
        </Button>
      </form>
    </Signup2>
  );
}
