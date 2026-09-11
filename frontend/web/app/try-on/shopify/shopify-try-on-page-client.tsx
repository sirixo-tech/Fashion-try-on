"use client";

import { useEffect, useRef, useState } from "react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SelfxLogo,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  createShopifyTryOnRun,
  getShopifyTryOnSession,
  getShopifyTryOnRun,
  uploadShopifyTryOnPersonImage,
  type ShopifyTryOnRun,
  type ShopifyTryOnSession,
} from "@/lib/shopify-storefront-try-on-api";

type PageState =
  | { status: "INVALID" }
  | { status: "LOADING" }
  | { status: "READY"; session: ShopifyTryOnSession }
  | {
      status: "PHOTO_READY";
      session: ShopifyTryOnSession;
      previewUrl: string;
    }
  | {
      status: "RUNNING";
      session: ShopifyTryOnSession;
      previewUrl: string;
      run: ShopifyTryOnRun;
    }
  | {
      status: "COMPLETED";
      session: ShopifyTryOnSession;
      previewUrl: string;
      run: ShopifyTryOnRun;
    }
  | { status: "ERROR"; message: string; session?: ShopifyTryOnSession };

const supportedTypes = ["image/jpeg", "image/png", "image/webp"];

export function ShopifyTryOnPageClient({
  sessionToken,
}: {
  sessionToken: string | null;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<PageState>(() =>
    validSessionToken(sessionToken)
      ? { status: "LOADING" }
      : { status: "INVALID" },
  );
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!validSessionToken(sessionToken)) {
      return;
    }
    let cancelled = false;
    setState({ status: "LOADING" });
    getShopifyTryOnSession(sessionToken)
      .then((session) => {
        if (!cancelled) {
          setState({ status: "READY", session });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ status: "ERROR", message: messageFor(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionToken]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (state.status !== "RUNNING") {
      return;
    }
    let cancelled = false;
    const poll = async () => {
      try {
        const next = await getShopifyTryOnRun(state.session.session, state.run.id);
        if (cancelled) {
          return;
        }
        if (next.status === "COMPLETED" && next.result) {
          setState({
            status: "COMPLETED",
            session: state.session,
            previewUrl: state.previewUrl,
            run: next,
          });
          return;
        }
        if (next.status === "FAILED") {
          setState({
            status: "ERROR",
            session: state.session,
            message: next.errorMessage ?? "Try-On could not be completed.",
          });
          return;
        }
        setState({
          status: "RUNNING",
          session: state.session,
          previewUrl: state.previewUrl,
          run: next,
        });
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "ERROR",
            session: state.session,
            message: messageFor(error),
          });
        }
      }
    };
    const timer = window.setInterval(() => {
      void poll();
    }, 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [state]);

  async function selectPersonImage(file: File | undefined) {
    setMessage(null);
    if (!file || busy || !consented) {
      return;
    }
    if (!supportedTypes.includes(file.type) || file.size <= 0) {
      setMessage("Choose a JPG, PNG or WebP photo.");
      return;
    }
    const session = sessionFrom(state);
    if (!session) {
      setMessage("Try-On session is not ready yet.");
      return;
    }
    setBusy(true);
    const nextPreviewUrl = URL.createObjectURL(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(nextPreviewUrl);
    try {
      await uploadShopifyTryOnPersonImage(session.session, file);
      setState({
        status: "PHOTO_READY",
        session,
        previewUrl: nextPreviewUrl,
      });
    } catch (error) {
      URL.revokeObjectURL(nextPreviewUrl);
      setPreviewUrl(null);
      setMessage(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  async function startTryOn() {
    if (busy || state.status !== "PHOTO_READY") {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const run = await createShopifyTryOnRun(state.session.session);
      setState({
        status: "RUNNING",
        session: state.session,
        previewUrl: state.previewUrl,
        run,
      });
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setBusy(false);
    }
  }

  const session = sessionFrom(state);
  const productLabel =
    session?.product.handle ??
    session?.product.externalProductId;

  return (
    <main className="min-h-dvh bg-background px-4 py-8">
      <div className="mx-auto grid min-h-[calc(100dvh-4rem)] w-full max-w-5xl items-center gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card className="w-full">
          <CardHeader>
            <SelfxLogo />
            <CardTitle className="pt-4 text-3xl">SelfX Try-On</CardTitle>
            <CardDescription>
              {state.status === "INVALID"
                ? "This Try-On link is missing a valid session."
                : "Your Shopify product is ready for virtual try-on."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {state.status === "INVALID" ? (
              <InvalidLink />
            ) : state.status === "LOADING" ? (
              <StatePanel title="Preparing Try-On..." />
            ) : state.status === "ERROR" ? (
              <StatePanel title="Try-On unavailable" body={state.message} />
            ) : (
              <>
                <ProductSummary
                  label={productLabel ?? "Shopify product"}
                  imageUrl={session?.product.imageUrl}
                />

                <label className="flex items-start gap-3 rounded-lg border bg-muted px-4 py-3 text-sm">
                  <input
                    type="checkbox"
                    checked={consented}
                    onChange={(event) => setConsented(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I consent to SelfX processing my photo to generate this
                    virtual try-on.
                  </span>
                </label>

                <input
                  ref={cameraInput}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="user"
                  onChange={(event) => {
                    void selectPersonImage(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
                <input
                  ref={galleryInput}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    void selectPersonImage(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    type="button"
                    disabled={!consented || busy || state.status === "RUNNING"}
                    onClick={() => cameraInput.current?.click()}
                  >
                    Take Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!consented || busy || state.status === "RUNNING"}
                    onClick={() => galleryInput.current?.click()}
                  >
                    Upload Photo
                  </Button>
                </div>

                {state.status === "PHOTO_READY" ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void startTryOn()}
                  >
                    {busy ? "Starting..." : "Start Try-On"}
                  </Button>
                ) : null}

                {state.status === "RUNNING" ? (
                  <StatePanel title="Creating your Try-On..." />
                ) : null}

                {message ? (
                  <div className="rounded-lg border bg-muted px-4 py-3 text-sm">
                    {message}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <ResultPanel state={state} />
      </div>
    </main>
  );
}

function ResultPanel({ state }: { state: PageState }) {
  if (
    state.status !== "PHOTO_READY" &&
    state.status !== "RUNNING" &&
    state.status !== "COMPLETED"
  ) {
    return (
      <Card className="hidden min-h-[520px] items-center justify-center lg:flex">
        <CardContent className="text-center text-sm text-muted-foreground">
          Your photo and result will appear here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">
          {state.status === "COMPLETED" ? "Your Result" : "Your Photo"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-hidden rounded-lg border bg-muted">
          <img
            src={
              state.status === "COMPLETED"
                ? state.run.result?.readUrl
                : state.previewUrl
            }
            alt={
              state.status === "COMPLETED"
                ? "Generated SelfX Try-On result"
                : "Selected person photo"
            }
            className="max-h-[70dvh] w-full object-contain"
          />
        </div>
        {state.status === "COMPLETED" ? (
          <Button
            className="w-full"
            render={<a href={state.run.result?.readUrl} download />}
          >
            Download
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProductSummary({
  label,
  imageUrl,
}: {
  label: string;
  imageUrl?: string;
}) {
  return (
    <div className="grid grid-cols-[72px_1fr] gap-4 rounded-lg border bg-muted p-3">
      <div className="flex aspect-square items-center justify-center overflow-hidden rounded-md bg-background">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-xs font-semibold uppercase text-muted-foreground">
            Product
          </span>
        )}
      </div>
      <div className="min-w-0 self-center">
        <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
          Product
        </div>
        <div className="mt-1 break-words text-sm font-medium">{label}</div>
      </div>
    </div>
  );
}

function InvalidLink() {
  return (
    <div className="rounded-lg border bg-muted px-4 py-5">
      <div className="font-semibold">Invalid Try-On link</div>
      <p className="mt-1 text-sm text-muted-foreground">
        Return to the product page and select Try It On again.
      </p>
    </div>
  );
}

function StatePanel({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-lg border bg-muted px-4 py-5">
      <div className="font-semibold">{title}</div>
      {body ? (
        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      ) : null}
    </div>
  );
}

function sessionFrom(state: PageState): ShopifyTryOnSession | null {
  return "session" in state ? (state.session ?? null) : null;
}

function validSessionToken(sessionToken: string | null): sessionToken is string {
  return Boolean(sessionToken && /^[A-Za-z0-9_-]{43}$/.test(sessionToken));
}

function messageFor(error: unknown): string {
  if (error instanceof SafeApiError) {
    if (error.code === "SHOPIFY_STOREFRONT_TRYON_PRODUCT_NOT_ENABLED") {
      return "This product is not enabled for SelfX Try-On yet.";
    }
    if (error.code === "SHOPIFY_STOREFRONT_TRYON_PERSON_REQUIRED") {
      return "Add your photo before starting Try-On.";
    }
    if (error.code === "OBJECT_STORAGE_NOT_CONFIGURED") {
      return "SelfX uploads are not configured yet.";
    }
    return error.message;
  }
  return "Try-On could not be completed right now.";
}
