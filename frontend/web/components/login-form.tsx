"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  Building2Icon,
  EyeIcon,
  EyeOffIcon,
  LockKeyholeIcon,
  MonitorIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
} from "lucide-react";

import { Alert, AlertDescription, Button, Input, Label } from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  getPublicLoginPageSettings,
  type LoginPageSettings,
} from "@/lib/platform-settings";
import { useSession } from "@/lib/session";

const demoLoginGroups = [
  {
    label: "Platform",
    accounts: [
      { label: "Super Admin", email: "platform.superadmin@selfx.local" },
      { label: "Staff Admin", email: "platform.staff@selfx.local" },
      { label: "Support", email: "platform.support@selfx.local" },
    ],
  },
  {
    label: "Store",
    accounts: [
      { label: "Store Owner", email: "store.owner@selfx.local" },
      { label: "Manager", email: "store.manager@selfx.local" },
      { label: "Staff", email: "store.staff@selfx.local" },
    ],
  },
] as const;

const demoLoginPassword =
  process.env.NEXT_PUBLIC_SELFX_DEMO_LOGIN_PASSWORD ?? "";
const demoLoginsEnabled =
  process.env.NEXT_PUBLIC_SELFX_DEMO_LOGINS_ENABLED === "true" &&
  demoLoginPassword.length > 0;

const fallbackLoginPageSettings: LoginPageSettings = {
  eyebrow: "SelfX Virtual Try-On",
  headline: "Bring every fitting room to life",
  body: "Manage Stores, kiosks, catalog products and Try-On operations from one SelfX control center.",
  mediaType: "VIDEO",
  mediaUrl: "/login-default-video.mp4",
  mediaPosterUrl: null,
  mediaMuted: true,
  cards: [
    {
      title: "Store control",
      description: "Operate Store access, products and kiosks from one place.",
    },
    {
      title: "Try-On ready",
      description: "Keep visual AI workflows behind SelfX permissions.",
    },
  ],
  bullets: [
    "Permission-aware dashboards for every role",
    "One backend for Store, kiosk and future channel access",
    "Provider credentials stay server-side",
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

  function selectDemoLogin(nextEmail: string) {
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
              Admin Portal
            </span>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white/95 p-4 shadow-[0_24px_70px_rgba(15,23,42,0.14)] backdrop-blur sm:p-5">
            <div className="mb-4">
              <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-normal text-slate-600">
                <LockKeyholeIcon size={14} aria-hidden="true" />
                Secure Workspace
              </span>
              <h1 className="text-[1.65rem] font-semibold leading-tight text-slate-950">
                Sign in to SelfX
              </h1>
              <p className="mt-2 max-w-[28rem] text-[0.93rem] leading-6 text-slate-600">
                Manage platform, Store and kiosk operations from one controlled
                workspace.
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
                  {submitting ? "Signing in" : "Sign in to dashboard"}
                </span>
                <ArrowRightIcon size={18} aria-hidden="true" />
              </Button>
            </form>

            <div className="mt-4 grid gap-3 border-t pt-3.5 text-xs font-medium text-slate-600 sm:grid-cols-2">
              <span className="inline-flex items-center gap-2">
                <ShieldCheckIcon size={15} aria-hidden="true" />
                Server-side RBAC
              </span>
              <span className="inline-flex items-center gap-2">
                <Building2Icon size={15} aria-hidden="true" />
                Tenant isolation
              </span>
            </div>
          </div>

          <p className="mt-4 text-center text-xs text-slate-500">
            New Store access is handled through the approved SelfX onboarding
            flow.
          </p>
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
          Quick access
        </span>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[0.65rem] font-medium text-slate-500 shadow-sm">
          demo password {demoLoginPassword}
        </span>
      </div>

      <div className="space-y-2">
        {demoLoginGroups.map((group) => (
          <div key={group.label} className="space-y-1.5">
            <div className="text-[0.65rem] font-semibold uppercase tracking-normal text-slate-500">
              {group.label}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.accounts.map((account) => {
                const selected = account.email === selectedEmail;
                return (
                  <Button
                    key={account.email}
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-pressed={selected}
                    style={
                      selected
                        ? {
                            backgroundColor: "#ff5a00",
                            borderColor: "#ff5a00",
                            color: "#ffffff",
                          }
                        : undefined
                    }
                    className={
                      selected
                        ? "h-6 rounded-full border-[#ff5a00] bg-[#ff5a00] px-2.5 text-[0.7rem] text-white shadow-[0_6px_16px_rgba(255,90,0,0.28)] hover:border-[#ff5a00] hover:bg-[#ff5a00] hover:text-white"
                        : "h-6 rounded-full bg-white px-2.5 text-[0.7rem] text-slate-600 hover:bg-slate-100"
                    }
                    onClick={() => onSelect(account.email)}
                  >
                    {account.label}
                  </Button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
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
