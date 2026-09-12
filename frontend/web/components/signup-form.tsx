"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  CheckCircle2Icon,
  EyeIcon,
  EyeOffIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UserPlusIcon,
} from "lucide-react";

import { Alert, AlertDescription, Button, Input, Label } from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import { safeLoginNextPath } from "@/lib/login-next";
import { useSession } from "@/lib/session";
import { getSignupChallenge, type SignupChallenge } from "@/lib/signup";

export function SignupForm() {
  const router = useRouter();
  const session = useSession();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [challenge, setChallenge] = useState<SignupChallenge | null>(null);
  const [loadingChallenge, setLoadingChallenge] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [nextPath, setNextPath] = useState("/app/dashboard");

  useEffect(() => {
    setNextPath(
      safeLoginNextPath(new URLSearchParams(window.location.search).get("next")),
    );
  }, []);

  useEffect(() => {
    void refreshChallenge();
  }, []);

  const loginHref = useMemo(
    () =>
      nextPath === "/app/dashboard"
        ? "/login"
        : `/login?next=${encodeURIComponent(nextPath)}`,
    [nextPath],
  );

  async function refreshChallenge() {
    setLoadingChallenge(true);
    setChallengeAnswer("");
    try {
      setChallenge(await getSignupChallenge());
      setErrorCode(null);
    } catch (error) {
      setErrorCode(
        error instanceof SafeApiError ? error.code : "REQUEST_FAILED",
      );
    } finally {
      setLoadingChallenge(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) {
      setErrorCode("AUTH_SIGNUP_CHALLENGE_INVALID");
      return;
    }
    setSubmitting(true);
    setErrorCode(null);

    try {
      await session.signup({
        displayName,
        email,
        password,
        challengeToken: challenge.challengeToken,
        challengeAnswer,
      });
      router.push(nextPath);
    } catch (error) {
      setErrorCode(
        error instanceof SafeApiError ? error.code : "REQUEST_FAILED",
      );
      if (
        error instanceof SafeApiError &&
        error.code === "AUTH_SIGNUP_CHALLENGE_INVALID"
      ) {
        await refreshChallenge();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-hidden bg-[#f3f7f8] text-foreground lg:grid lg:grid-cols-[minmax(32rem,0.68fr)_minmax(0,1.32fr)]">
      <section className="relative z-10 min-h-dvh border-r bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,250,249,0.92)),linear-gradient(#e4ecef_1px,transparent_1px),linear-gradient(90deg,#e4ecef_1px,transparent_1px)] bg-[size:auto,44px_44px,44px_44px] px-4 py-5 sm:px-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#12c8a4,#38bdf8,#111827)]" />
        <div className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-[32rem] flex-col justify-center py-4">
          <div className="mb-4 flex flex-col items-center gap-2.5">
            <Image
              src="/brand/selfx-logo.png"
              alt="SelfX"
              width={278}
              height={105}
              priority
              className="h-auto w-36 sm:w-44"
            />
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-normal text-primary">
              <span className="size-2 rounded-full bg-primary" />
              SelfX Dashboard
            </span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white/95 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur sm:p-5">
            <div className="mb-4">
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-normal text-slate-600">
                <UserPlusIcon size={14} aria-hidden="true" />
                Create Workspace
              </span>
              <h1 className="text-[1.65rem] font-semibold leading-tight text-slate-950">
                Create your SelfX account
              </h1>
              <p className="mt-2 max-w-[28rem] text-[0.93rem] leading-6 text-slate-600">
                Your Store workspace is created automatically with 10 trial
                Try-On credits.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <div className="space-y-2">
                <Label
                  htmlFor="selfx-signup-name"
                  className="text-xs font-semibold text-slate-700"
                >
                  Name
                </Label>
                <Input
                  id="selfx-signup-name"
                  name="name"
                  autoComplete="name"
                  placeholder="Your name"
                  value={displayName}
                  className="h-10 bg-white text-sm"
                  onChange={(event) => setDisplayName(event.currentTarget.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="selfx-signup-email"
                  className="text-xs font-semibold text-slate-700"
                >
                  Email address
                </Label>
                <Input
                  id="selfx-signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  className="h-10 bg-white text-sm"
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="selfx-signup-password"
                  className="text-xs font-semibold text-slate-700"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="selfx-signup-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="At least 12 characters"
                    value={password}
                    className="h-10 bg-white pr-11 text-sm"
                    minLength={12}
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    required
                  />
                  <button
                    type="button"
                    aria-label={
                      showPassword ? "Hide password" : "Show password"
                    }
                    aria-pressed={showPassword}
                    className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    onClick={() => setShowPassword((visible) => !visible)}
                  >
                    {showPassword ? (
                      <EyeOffIcon size={17} aria-hidden="true" />
                    ) : (
                      <EyeIcon size={17} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/85 p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <Label
                    htmlFor="selfx-signup-challenge"
                    className="text-xs font-semibold text-slate-700"
                  >
                    Quick check
                  </Label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
                    onClick={() => void refreshChallenge()}
                    disabled={loadingChallenge}
                  >
                    <RefreshCwIcon size={13} aria-hidden="true" />
                    New
                  </button>
                </div>
                <div className="grid grid-cols-[8.25rem_minmax(0,1fr)] gap-2">
                  <div className="flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-base font-semibold text-slate-950">
                    {loadingChallenge ? "..." : `${challenge?.question ?? "--"} =`}
                  </div>
                  <Input
                    id="selfx-signup-challenge"
                    name="challenge"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="Answer"
                    value={challengeAnswer}
                    className="h-10 bg-white text-sm"
                    onChange={(event) =>
                      setChallengeAnswer(event.currentTarget.value)
                    }
                    required
                  />
                </div>
              </div>

              {errorCode ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    Signup failed: {errorCode}
                  </AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                disabled={submitting || loadingChallenge}
                className="h-11 w-full justify-between bg-slate-950 px-5 text-sm font-semibold hover:bg-slate-800"
              >
                <span>{submitting ? "Creating account" : "Create account"}</span>
                <ArrowRightIcon size={18} aria-hidden="true" />
              </Button>
            </form>

            <div className="mt-4 grid gap-3 border-t pt-3.5 text-xs font-medium text-slate-600 sm:grid-cols-2">
              <span className="inline-flex items-center gap-2">
                <ShieldCheckIcon size={15} aria-hidden="true" />
                Secure sessions
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2Icon size={15} aria-hidden="true" />
                10 trial credits
              </span>
            </div>

            <p className="mt-4 text-center text-sm text-slate-600">
              Already have an account?{" "}
              <Link
                href={loginHref}
                className="font-semibold text-primary hover:text-primary/80"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="relative hidden min-h-dvh overflow-hidden bg-[#05080d] text-white lg:block">
        <video
          className="absolute inset-0 size-full object-cover"
          src="/login-default-video.mp4"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,13,0.74),rgba(5,8,13,0.22)_48%,rgba(5,8,13,0.74)),linear-gradient(180deg,rgba(5,8,13,0.2),rgba(5,8,13,0.9))]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative z-10 flex h-full min-h-dvh items-center px-8 py-9 xl:px-14 xl:py-12">
          <div className="w-full max-w-[55rem]">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-normal text-white/90 backdrop-blur">
              <SparklesIcon size={15} aria-hidden="true" />
              SelfX Virtual Try-On
            </div>
            <h2 className="max-w-[48rem] text-[2.45rem] font-semibold leading-[1.08] text-white xl:text-[2.9rem]">
              One account for online stores and kiosk Try-On
            </h2>
            <p className="mt-5 max-w-[38rem] text-[1.05rem] leading-8 text-white/76">
              Connect Shopify or WooCommerce, manage kiosk operations, and track
              Try-On credits from the same SelfX dashboard.
            </p>
            <div className="mt-8 grid max-w-[43rem] gap-3 lg:grid-cols-2">
              {[
                ["Store created automatically", "No separate approval step for trial access."],
                ["Credits ready immediately", "Use the same trial credits across supported channels."],
              ].map(([title, body]) => (
                <div
                  key={title}
                  className="rounded-lg border border-white/16 bg-white/10 p-4 backdrop-blur-md"
                >
                  <h3 className="text-[0.95rem] font-semibold text-white">
                    {title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-6 text-white/66">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
