"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EyeIcon,
  EyeOffIcon,
  MonitorIcon,
  ShieldCheckIcon,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  SelectMenu,
  type SelectMenuOption,
} from "@selfx/ui";

import { SafeApiError, selfxApi } from "@/lib/api";
import { GoogleSignIn } from "./google-sign-in";
import { PublicLegalLinks } from "@/components/public-legal-links";
import { SelfxBrandLogo } from "@/components/selfx-brand-logo";
import { resolveLoginNextPath, safeLoginNextPath } from "@/lib/login-next";
import {
  getPublicLoginPageSettings,
  type LoginPageSettings,
} from "@/lib/platform-settings";
import { useSession } from "@/lib/session";

const demoLoginGroups = [
  {
    label: "Platform",
    accounts: [
      { label: "Super Admin", email: "super-admin@selfx.local" },
      { label: "Admin", email: "platform-staff-admin@selfx.local" },
      { label: "Staff", email: "support-admin@selfx.local" },
    ],
  },
  {
    label: "Store",
    accounts: [
      { label: "Store Admin", email: "store-admin@selfx.local" },
      { label: "Store Staff", email: "store-staff@selfx.local" },
    ],
  },
] as const;

const demoLoginOptions: ReadonlyArray<SelectMenuOption<string>> = [
  { value: "", label: "Quick access · demo accounts" },
  ...demoLoginGroups.flatMap((group) =>
    group.accounts.map((account) => ({
      value: account.email,
      label: `${group.label} - ${account.label}`,
    })),
  ),
];

const demoLoginPassword =
  process.env.NEXT_PUBLIC_SELFX_DEMO_LOGIN_PASSWORD ?? "";
const demoLoginsEnabled =
  process.env.NEXT_PUBLIC_SELFX_DEMO_LOGINS_ENABLED === "true" &&
  demoLoginPassword.length > 0;

const fallbackLoginPageSettings: LoginPageSettings = {
  eyebrow: "SelfX Virtual Try-On",
  headline: "Bring virtual try-on to every storefront",
  body: "Launch AI Try-On for Shopify, WooCommerce and in-store kiosks from one secure SelfX dashboard.",
  mediaType: "VIDEO",
  mediaUrl: "/login-default-video.mp4",
  mediaPosterUrl: null,
  mediaMuted: true,
  cards: [
    {
      title: "Commerce ready",
      description: "Connect online catalogs and manage product Try-On access.",
    },
    {
      title: "Kiosk ready",
      description: "Operate in-store Try-On devices from the same workspace.",
    },
  ],
  bullets: [
    "One dashboard for merchants, staff and SelfX admins",
    "Credits, products and Try-On results in one place",
    "Provider credentials and customer media stay protected",
  ],
};

export function LoginForm() {
  const router = useRouter();
  const session = useSession();
  const [pageSettings, setPageSettings] = useState<LoginPageSettings>(
    fallbackLoginPageSettings,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signupHref, setSignupHref] = useState("/signup");
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  const [linkPending, setLinkPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    getPublicLoginPageSettings()
      .then((settings) => {
        if (!cancelled) {
          setPageSettings(settings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPageSettings(fallbackLoginPageSettings);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const google = new URLSearchParams(window.location.search).get("google");
    setLinkPending(google === "link_required");
    setGoogleNotice(
      google === "link_required"
        ? "An account already uses this email. Sign in with that account’s password to connect Google."
        : google === "signup_required"
          ? "Create your SelfX account using Continue with Google on the signup page."
          : google === "cancelled"
            ? "Google sign-in was cancelled. You can try again."
            : google
              ? "Google sign-in could not be completed. Please try again."
              : null,
    );
    const next = new URLSearchParams(window.location.search).get("next");
    setSignupHref(
      next
        ? `/signup?next=${encodeURIComponent(safeLoginNextPath(next))}`
        : "/signup",
    );
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorCode(null);

    try {
      const authenticated = await session.login(email, password);
      if (linkPending) {
        await selfxApi("/api/v1/auth/google/link", {
          method: "POST",
          accessToken: authenticated.accessToken,
          body: JSON.stringify({ password }),
        });
      }
      const next = await resolveLoginNextPath(
        new URLSearchParams(window.location.search).get("next"),
        authenticated,
      );
      router.replace(next);
    } catch (error) {
      setErrorCode(
        error instanceof SafeApiError ? error.code : "REQUEST_FAILED",
      );
    } finally {
      setSubmitting(false);
    }
  }

  function selectDemoLogin(nextEmail: string) {
    if (!nextEmail) {
      return;
    }
    setEmail(nextEmail);
    setPassword(demoLoginPassword);
    setErrorCode(null);
  }

  return (
    <main className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[minmax(26rem,0.9fr)_minmax(0,1.1fr)]">
      <section className="flex min-h-dvh items-center justify-center px-4 py-6 sm:px-8 lg:py-4">
        <Card className="w-full max-w-md shadow-soft motion-safe:transform-none">
          <CardContent className="px-5 py-2 sm:px-7 sm:py-3 lg:py-0">
            <SelfxBrandLogo className="mb-5 h-auto w-32 lg:mb-4" priority />
            <div className="mb-5 lg:mb-4">
              <h1 className="text-2xl font-semibold tracking-tight">
                Welcome back
              </h1>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
                Sign in to manage your SelfX workspace.
              </p>
            </div>

            {googleNotice && (
              <Alert className="mb-4">
                <AlertDescription>{googleNotice}</AlertDescription>
                {linkPending && (
                  <Button
                    variant="link"
                    className="mt-2 p-0"
                    disabled={submitting}
                    onClick={() => {
                      const url = new URL(window.location.href);
                      url.searchParams.delete("google");
                      window.history.replaceState(
                        {},
                        "",
                        `${url.pathname}${url.search}`,
                      );
                      setLinkPending(false);
                      setGoogleNotice(null);
                      setErrorCode(null);
                    }}
                  >
                    Sign in without connecting Google
                  </Button>
                )}
              </Alert>
            )}
            <form onSubmit={onSubmit} className="space-y-3 lg:space-y-2">
              {demoLoginsEnabled ? (
                <DemoRoleAccess
                  selectedEmail={email}
                  onSelect={selectDemoLogin}
                />
              ) : null}
              <div className="space-y-2 lg:space-y-1.5">
                <Label
                  htmlFor="selfx-login-email"
                  className="text-sm font-medium"
                >
                  Email address
                </Label>
                <Input
                  id="selfx-login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@company.com"
                  value={email}
                  className="h-10 bg-card text-sm"
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  required
                />
              </div>
              <div className="space-y-2 lg:space-y-1.5">
                <Label
                  htmlFor="selfx-login-password"
                  className="text-sm font-medium"
                >
                  Password
                </Label>
                <div className="relative">
                  <Input
                    id="selfx-login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    className="h-10 bg-card pr-11 text-sm"
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
              {errorCode ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    {errorCode.startsWith("AUTH_GOOGLE_")
                      ? "Google could not be connected. Use the matching SelfX account and start Google sign-in again if the request has expired."
                      : `Sign in failed: ${errorCode}`}
                  </AlertDescription>
                </Alert>
              ) : null}
              <div className="text-right text-sm">
                <Link
                  className="font-medium hover:text-primary"
                  href="/forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
              <Button
                type="submit"
                disabled={submitting}
                className="h-11 w-full text-sm font-semibold"
                aria-busy={submitting}
              >
                {submitting ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <GoogleSignIn mode="login" disabled={submitting} />

            <p className="mt-4 text-center text-sm text-muted-foreground lg:mt-3">
              New to SelfX?{" "}
              <Link
                href={signupHref}
                className="font-semibold text-primary hover:text-primary/80"
              >
                Create account
              </Link>
            </p>

            <PublicLegalLinks className="mt-5 border-t pt-4 text-xs lg:mt-3 lg:pt-3" />
          </CardContent>
        </Card>
      </section>

      <LoginMediaPanel settings={pageSettings} />
    </main>
  );
}

function DemoRoleAccess({
  selectedEmail,
  onSelect,
}: {
  selectedEmail: string;
  onSelect: (email: string) => void;
}) {
  return (
    <SelectMenu
      ariaLabel="Select demo account"
      value={
        demoLoginOptions.some((option) => option.value === selectedEmail)
          ? selectedEmail
          : ""
      }
      options={demoLoginOptions}
      placeholder="Quick access · demo accounts"
      className="h-10 bg-card text-sm"
      contentClassName="max-h-72"
      onChange={onSelect}
    />
  );
}

function LoginMediaPanel({ settings }: { settings: LoginPageSettings }) {
  return (
    <section className="sticky top-0 hidden h-dvh overflow-hidden rounded-l-3xl bg-slate-950 text-white lg:block">
      <LoginMedia settings={settings} />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,13,0.72),rgba(5,8,13,0.18)_46%,rgba(5,8,13,0.68)),linear-gradient(180deg,rgba(5,8,13,0.24),rgba(5,8,13,0.9))]" />
      <div className="relative z-10 flex h-full items-center px-8 py-9 xl:px-14 xl:py-12">
        <div className="w-full max-w-2xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-widest text-white/80">
            {settings.eyebrow}
          </p>
          <h2 className="text-4xl font-semibold leading-tight text-white xl:text-5xl">
            {settings.headline}
          </h2>
          <p className="mt-5 max-w-xl text-base leading-7 text-white/80">
            {settings.body}
          </p>

          <div className="mt-8 grid gap-4 xl:grid-cols-2">
            {settings.cards.slice(0, 2).map((card, index) => (
              <div
                key={`${card.title}-${index}`}
                className="rounded-xl border border-white/20 bg-slate-950/80 p-4"
              >
                <div className="flex items-start gap-3.5">
                  <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/10 text-primary">
                    {index === 0 ? (
                      <MonitorIcon size={17} aria-hidden="true" />
                    ) : (
                      <ShieldCheckIcon size={17} aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-[0.95rem] font-semibold text-white">
                      {card.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-6 text-white/66">
                      {card.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function LoginMedia({ settings }: { settings: LoginPageSettings }) {
  if (settings.mediaType === "VIDEO") {
    return (
      <video
        className="absolute inset-0 size-full object-cover"
        src={settings.mediaUrl}
        poster={settings.mediaPosterUrl ?? undefined}
        autoPlay
        muted={settings.mediaMuted !== false}
        loop
        playsInline
      />
    );
  }

  return (
    <Image
      className="absolute inset-0 size-full object-cover"
      src={settings.mediaUrl}
      alt=""
      fill
      unoptimized
      sizes="50vw"
    />
  );
}
