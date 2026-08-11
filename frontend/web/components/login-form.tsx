"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, Button, PasswordInput, Stack, TextInput } from "@selfx/ui";

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
      description="Access the SelfX staff and platform administration shell."
      footer="Signup is reserved for the approved onboarding flow and is not enabled in this local shell yet."
    >
      <form onSubmit={onSubmit}>
        <Stack gap="md">
          <TextInput
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
            required
          />
          <PasswordInput
            label="Password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            required
          />
          {errorCode ? (
            <Alert color="danger" variant="light">
              Sign in failed: {errorCode}
            </Alert>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? "Signing in" : "Sign in"}
          </Button>
        </Stack>
      </form>
    </Signup2>
  );
}
