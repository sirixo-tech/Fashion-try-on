"use client";

import { useEffect, useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  buttonVariants,
  cn,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  getPublicTryOnShare,
  type PublicTryOnShare,
} from "@/lib/try-on-share-api";

type PageState =
  | { status: "LOADING" }
  | { status: "READY"; share: PublicTryOnShare }
  | { status: "EXPIRED" }
  | { status: "INVALID" };

export function LooksSharePageClient({ capability }: { capability: string }) {
  const [state, setState] = useState<PageState>({ status: "LOADING" });

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      getPublicTryOnShare(capability)
        .then((share) => {
          if (!cancelled) {
            setState({ status: "READY", share });
          }
        })
        .catch((error) => {
          if (cancelled) {
            return;
          }
          if (error instanceof SafeApiError && error.status === 410) {
            setState({ status: "EXPIRED" });
            return;
          }
          setState({ status: "INVALID" });
        });
    };
    load();
    const refreshTimer = window.setInterval(load, 4 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [capability]);

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-base font-black text-primary-foreground">
            SX
          </div>
          <div className="text-xl font-black">SelfX</div>
        </div>

        {state.status === "LOADING" ? (
          <ShareState title="Getting your looks..." />
        ) : state.status === "EXPIRED" ? (
          <ShareState title="This link has expired." />
        ) : state.status === "INVALID" ? (
          <ShareState title="This link is unavailable." />
        ) : state.share.looks.length === 0 ? (
          <ShareState title="No looks are available." />
        ) : (
          <div className="space-y-4">
            <header className="text-center">
              <h1 className="text-3xl font-black tracking-normal">Your Looks</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Available for a limited time
              </p>
            </header>

            {state.share.looks.map((look, index) => (
              <Card key={look.lookId} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Look {index + 1}</CardTitle>
                  {look.productName ? (
                    <CardDescription>{look.productName}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={look.imageReadUrl}
                      alt={`SelfX look ${index + 1}`}
                      className="max-h-[72vh] w-full object-contain"
                    />
                  </div>
                  <a
                    className={cn(buttonVariants(), "w-full")}
                    href={look.imageReadUrl}
                    download={`selfx-look-${index + 1}`}
                    rel="noreferrer"
                  >
                    Download
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function ShareState({ title }: { title: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center">
        <div className="font-semibold">{title}</div>
      </CardContent>
    </Card>
  );
}
