"use client";

import { useEffect, useMemo, useState } from "react";
import { DownloadIcon, MonitorSmartphoneIcon, XIcon } from "lucide-react";

import { Button } from "@selfx/ui";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isStandaloneDisplay() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = window.navigator as Navigator & {
    standalone?: boolean;
  };

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

export function WebKioskInstallBanner() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setInstalled(isStandaloneDisplay());

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Installation should remain optional; kiosk browsing still works.
      });
    }

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const helpText = useMemo(() => {
    if (installPrompt) {
      return "Install this kiosk as a fullscreen web app on supported Chrome or Edge devices.";
    }

    return "On iPhone or iPad, use Safari Share and Add to Home Screen. On desktop, use the browser install option when available.";
  }, [installPrompt]);

  if (dismissed || installed) {
    return null;
  }

  async function install() {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
    }
    setInstallPrompt(null);
  }

  return (
    <section
      aria-label="Install SelfX Kiosk"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-4xl rounded-lg border border-white/25 bg-white/95 p-3 text-slate-950 shadow-soft backdrop-blur sm:bottom-5 sm:p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <MonitorSmartphoneIcon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="font-heading text-base font-bold sm:text-lg">
              Install SelfX Kiosk as a fullscreen app
            </p>
            <p className="text-sm leading-5 text-slate-600">{helpText}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {installPrompt ? (
            <Button onClick={install} className="h-11 px-4 text-base">
              <DownloadIcon className="size-4" aria-hidden="true" />
              Install
            </Button>
          ) : null}
          <Button
            aria-label="Dismiss install prompt"
            variant="ghost"
            size="icon"
            onClick={() => setDismissed(true)}
            className="size-11"
          >
            <XIcon className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </section>
  );
}
