"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  EyeIcon,
  EyeOffIcon,
  LockKeyholeIcon,
  MonitorIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  SelectMenu,
  type SelectMenuOption,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import { safeLoginNextPath } from "@/lib/login-next";
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
      { label: "Staff Admin", email: "platform-staff-admin@selfx.local" },
      { label: "Support Admin", email: "support-admin@selfx.local" },
    ],
  },
  {
    label: "Store",
    accounts: [
      { label: "Store Owner", email: "store-owner@selfx.local" },
      { label: "Store Admin", email: "store-admin@selfx.local" },
      { label: "Store Manager", email: "store-manager@selfx.local" },
      { label: "Store Staff", email: "store-staff@selfx.local" },
    ],
  },
] as const;

const demoLoginOptions: ReadonlyArray<SelectMenuOption<string>> = [
  { value: "", label: "Select a demo account" },
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
      await session.login(email, password);
      const next = safeLoginNextPath(
        new URLSearchParams(window.location.search).get("next"),
      );
      router.push(next);
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
    <main className="h-dvh overflow-hidden bg-[#f3f7f8] text-foreground lg:grid lg:grid-cols-[minmax(32rem,0.68fr)_minmax(0,1.32fr)]">
      <section className="relative z-10 h-dvh min-h-0 overflow-y-auto border-r bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,250,249,0.92)),linear-gradient(#e4ecef_1px,transparent_1px),linear-gradient(90deg,#e4ecef_1px,transparent_1px)] bg-[size:auto,44px_44px,44px_44px] px-4 py-5 sm:px-6">
        <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#12c8a4,#38bdf8,#111827)]" />
        <div className="mx-auto w-full max-w-[32rem] pb-5">
          <div className="mb-4 flex flex-col items-center gap-2.5">
            <SelfxBrandLogo className="h-auto w-36 sm:w-44" priority />
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-normal text-primary">
              <span className="size-2 rounded-full bg-primary" />
              SelfX Dashboard
            </span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white/95 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur sm:p-5">
            <div className="mb-4">
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-normal text-slate-600">
                <LockKeyholeIcon size={14} aria-hidden="true" />
                Secure Dashboard
              </span>
              <h1 className="text-[1.65rem] font-semibold leading-tight text-slate-950">
                Sign in to SelfX
              </h1>
              <p className="mt-2 max-w-[28rem] text-[0.93rem] leading-6 text-slate-600">
                Manage Shopify Try-On, WooCommerce, kiosks, products, credits
                and results from one secure workspace.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              {demoLoginsEnabled ? (
                <DemoRoleAccess
                  selectedEmail={email}
                  onSelect={selectDemoLogin}
                />
              ) : null}
              <div className="space-y-2">
                <Label
                  htmlFor="selfx-login-email"
                  className="text-xs font-semibold text-slate-700"
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
                  className="h-10 bg-white text-sm"
                  onChange={(event) => setEmail(event.currentTarget.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="selfx-login-password"
                  className="text-xs font-semibold text-slate-700"
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
                    className="h-10 bg-white pr-11 text-sm"
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
                    Sign in failed: {errorCode}
                  </AlertDescription>
                </Alert>
              ) : null}
              <Button
                type="submit"
                disabled={submitting}
                className="h-11 w-full justify-between bg-slate-950 px-5 text-sm font-semibold hover:bg-slate-800"
              >
                <span>
                  {submitting ? "Signing in" : "Sign in"}
                </span>
                <ArrowRightIcon size={18} aria-hidden="true" />
              </Button>
            </form>

            <p className="mt-4 text-center text-sm text-slate-600">
              New to SelfX?{" "}
              <Link
                href={signupHref}
                className="font-semibold text-primary hover:text-primary/80"
              >
                Create account
              </Link>
            </p>

            <div className="mt-4 grid gap-3 border-t pt-3.5 text-xs font-medium text-slate-600 sm:grid-cols-2">
              <span className="inline-flex items-center gap-2">
                <ShieldCheckIcon size={15} aria-hidden="true" />
                Secure sessions
              </span>
              <span className="inline-flex items-center gap-2">
                <BadgeCheckIcon size={15} aria-hidden="true" />
                Protected workspace
              </span>
            </div>
          </div>
        </div>
      </section>

      <LoginMediaPanel settings={pageSettings} />
    </main>
  );
}

function SelfxBrandLogo({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/brand/selfx-logo.png"
      alt="SelfX"
      width={278}
      height={105}
      priority={priority}
      className={className}
    />
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
    <div className="rounded-lg border border-slate-200 bg-slate-50/85 p-2.5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-slate-800">
          <SparklesIcon size={15} aria-hidden="true" />
          Demo account
        </span>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[0.65rem] font-medium text-slate-500 shadow-sm">
          testing only
        </span>
      </div>

      <SelectMenu
        ariaLabel="Select demo account"
        value={
          demoLoginOptions.some((option) => option.value === selectedEmail)
            ? selectedEmail
            : ""
        }
        options={demoLoginOptions}
        placeholder="Select a demo account"
        className="h-9 bg-white text-xs"
        contentClassName="max-h-72"
        onChange={onSelect}
      />
      <p className="mt-2 text-[0.68rem] leading-5 text-slate-500">
        Selecting a demo account fills the shared test password automatically.
      </p>
    </div>
  );
}

function LoginMediaPanel({ settings }: { settings: LoginPageSettings }) {
  return (
    <section className="relative hidden h-dvh min-h-0 overflow-hidden bg-[#05080d] text-white lg:block">
      <LoginMedia settings={settings} />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,13,0.72),rgba(5,8,13,0.18)_46%,rgba(5,8,13,0.68)),linear-gradient(180deg,rgba(5,8,13,0.24),rgba(5,8,13,0.9))]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] bg-[size:48px_48px]" />

      <div className="absolute right-8 top-7 z-10 flex items-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/10 px-3 py-1.5 text-[0.7rem] font-semibold uppercase tracking-normal text-white/82 backdrop-blur">
          <PlayCircleIcon size={15} aria-hidden="true" />
          Managed Media
        </span>
      </div>

      <div className="relative z-10 flex h-full min-h-0 items-center px-8 py-9 xl:px-14 xl:py-12">
        <div className="w-full max-w-[55rem]">
          <div className="mb-5 inline-flex rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-normal text-white/90 backdrop-blur">
            {settings.eyebrow}
          </div>
          <h2 className="max-w-[48rem] text-[2.45rem] font-semibold leading-[1.08] text-white xl:text-[2.9rem]">
            {settings.headline}
          </h2>
          <p className="mt-5 max-w-[38rem] text-[1.05rem] leading-8 text-white/76">
            {settings.body}
          </p>

          <div className="mt-8 grid max-w-[43rem] gap-3 lg:grid-cols-2">
            {settings.cards.slice(0, 2).map((card, index) => (
              <div
                key={`${card.title}-${index}`}
                className="rounded-lg border border-white/16 bg-white/10 p-4 backdrop-blur-md"
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

          <ul className="mt-6 max-w-[48rem] space-y-3 text-sm font-medium leading-5 text-white/82">
            {settings.bullets.map((bullet) => (
              <li key={bullet} className="flex min-w-0 items-start gap-3">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
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
    <img
      className="absolute inset-0 size-full object-cover"
      src={settings.mediaUrl}
      alt=""
    />
  );
}
