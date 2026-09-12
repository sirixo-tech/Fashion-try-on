"use client";

import { useEffect, useRef, useState } from "react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  SelfxLogo,
} from "@selfx/ui";
import {
  CameraIcon,
  CheckCircle2Icon,
  DownloadIcon,
  ImageIcon,
  LoaderCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  UploadIcon,
} from "lucide-react";

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
const tryOnTemporarilyUnavailableMessage =
  "Try-On is temporarily unavailable for this store. Please try again later.";

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
  const [downloading, setDownloading] = useState(false);
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
            message: runFailureMessage(next),
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

  async function downloadResult() {
    if (downloading || state.status !== "COMPLETED") {
      return;
    }
    setDownloading(true);
    setMessage(null);
    try {
      const refreshedRun = await getShopifyTryOnRun(
        state.session.session,
        state.run.id,
      );
      if (!refreshedRun.result?.readUrl) {
        setMessage("Your Try-On result is not ready to download yet.");
        return;
      }
      setState({
        status: "COMPLETED",
        session: state.session,
        previewUrl: state.previewUrl,
        run: refreshedRun,
      });
      const link = document.createElement("a");
      link.href = refreshedRun.result.downloadUrl ?? refreshedRun.result.readUrl;
      link.download = downloadFilename(refreshedRun);
      link.rel = "noopener noreferrer";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      setMessage(messageFor(error));
    } finally {
      setDownloading(false);
    }
  }

  const session = sessionFrom(state);
  const productLabel =
    session?.product.handle ??
    session?.product.externalProductId;
  const isActiveSession =
    state.status !== "INVALID" &&
    state.status !== "LOADING" &&
    state.status !== "ERROR";

  return (
    <main className="min-h-dvh bg-[#f4f8f8] px-4 py-6 text-foreground sm:px-6 lg:py-8">
      <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-[1500px] gap-5 xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start">
        <Card className="w-full overflow-hidden border-border/70 bg-background shadow-[0_18px_60px_rgba(18,38,45,0.10)]">
          <CardHeader className="space-y-5 border-b bg-background pb-5">
            <div className="flex items-center justify-between gap-3">
              <SelfxLogo />
              <Badge variant="secondary" className="h-7 gap-1.5 px-3">
                <ShieldCheckIcon className="size-3.5" />
                Secure session
              </Badge>
            </div>
            <div>
              <CardTitle className="text-3xl">SelfX Try-On</CardTitle>
              <CardDescription className="mt-2 text-base">
                {state.status === "INVALID"
                  ? "This Try-On link is missing a valid session."
                  : "Your Shopify product is ready for virtual try-on."}
              </CardDescription>
            </div>
            {isActiveSession ? <ProgressStrip status={state.status} /> : null}
          </CardHeader>
          <CardContent className="space-y-5 p-5">
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

                <label className="flex items-start gap-3 rounded-lg border border-border/80 bg-[#edf5f5] px-4 py-3 text-sm leading-relaxed">
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
                    <CameraIcon data-icon="inline-start" />
                    Take Photo
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={!consented || busy || state.status === "RUNNING"}
                    onClick={() => galleryInput.current?.click()}
                  >
                    <UploadIcon data-icon="inline-start" />
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
                    <SparklesIcon data-icon="inline-start" />
                    {busy ? "Starting..." : "Start Try-On"}
                  </Button>
                ) : null}

                {state.status === "RUNNING" ? (
                  <StatePanel title="Creating your Try-On..." active />
                ) : null}

                {message ? (
                  <div className="rounded-lg border border-border/80 bg-[#fff7ed] px-4 py-3 text-sm">
                    {message}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <ResultPanel
          downloading={downloading}
          onDownload={() => void downloadResult()}
          productImageUrl={session?.product.imageUrl}
          productLabel={productLabel ?? "Shopify product"}
          state={state}
        />
      </div>
    </main>
  );
}

function ProgressStrip({
  status,
}: {
  status: Exclude<PageState["status"], "INVALID" | "LOADING" | "ERROR">;
}) {
  const steps = [
    { label: "Product", complete: true, active: status === "READY" },
    {
      label: "Photo",
      complete:
        status === "PHOTO_READY" ||
        status === "RUNNING" ||
        status === "COMPLETED",
      active: status === "PHOTO_READY",
    },
    {
      label: "Result",
      complete: status === "COMPLETED",
      active: status === "RUNNING" || status === "COMPLETED",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {steps.map((step) => (
        <div
          key={step.label}
          className={[
            "flex h-9 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold",
            step.complete
              ? "border-[#ff6b1a] bg-[#fff1e8] text-[#8f350d]"
              : step.active
                ? "border-[#7a9ca5] bg-[#edf5f5] text-[#284852]"
                : "border-border bg-muted text-muted-foreground",
          ].join(" ")}
        >
          {step.complete ? <CheckCircle2Icon className="size-3.5" /> : null}
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}

function ResultPanel({
  downloading,
  onDownload,
  productImageUrl,
  productLabel,
  state,
}: {
  downloading: boolean;
  onDownload: () => void;
  productImageUrl?: string;
  productLabel: string;
  state: PageState;
}) {
  const personImageUrl =
    state.status === "PHOTO_READY" ||
    state.status === "RUNNING" ||
    state.status === "COMPLETED"
      ? state.previewUrl
      : undefined;
  const resultImageUrl =
    state.status === "COMPLETED" ? state.run.result?.readUrl : undefined;
  const isRunning = state.status === "RUNNING";

  return (
    <div className="grid w-full items-start gap-5 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <Card className="w-full overflow-hidden border-border/70 bg-background shadow-[0_22px_70px_rgba(18,38,45,0.12)]">
        <CardHeader className="border-b bg-[#fbfdfd] pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <UploadIcon className="size-5 text-primary" />
                Inputs
              </CardTitle>
              <CardDescription>
                Product image and shopper photo used for this Try-On.
              </CardDescription>
            </div>
            <Badge variant="secondary" className="h-7 px-3">
              {personImageUrl ? "Inputs ready" : "Photo needed"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="rounded-lg border border-border/80 bg-[#f8fbfb] p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-[#fff1e8] text-[#ff6b1a]">
                <SparklesIcon className="size-5" />
              </span>
              <div>
                <div className="font-semibold">Review your Try-On inputs</div>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  SelfX combines the synced Shopify product image with your
                  uploaded photo to create the generated result.
                </p>
              </div>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <VisualTile
              title="Product"
              label={productLabel}
              imageUrl={productImageUrl}
              emptyLabel="Product image unavailable"
              state={productImageUrl ? "ready" : "empty"}
            />
            <VisualTile
              title="Your Photo"
              label={
                personImageUrl
                  ? "Uploaded image"
                  : "Waiting for your image"
              }
              imageUrl={personImageUrl}
              emptyLabel="Your uploaded photo will appear here"
              state={personImageUrl ? "ready" : "empty"}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="w-full overflow-hidden border-border/70 bg-background shadow-[0_22px_70px_rgba(18,38,45,0.12)] lg:sticky lg:top-6">
        <CardHeader className="border-b bg-[#fbfdfd] pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <SparklesIcon className="size-5 text-primary" />
                Try-On Result
              </CardTitle>
              <CardDescription>
                {state.status === "COMPLETED"
                  ? "Your generated SelfX image is ready."
                  : "The generated image will appear here."}
              </CardDescription>
            </div>
            <Badge
              variant={state.status === "COMPLETED" ? "default" : "secondary"}
              className="h-7 px-3"
            >
              {statusLabel(state)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <VisualTile
            title="Generated Image"
            label={
              resultImageUrl
                ? "SelfX result"
                : isRunning
                  ? "Generating try-on"
                  : "No result yet"
            }
            imageUrl={resultImageUrl}
            emptyLabel={
              isRunning
                ? "Creating your virtual try-on"
                : "Add your photo, then start Try-On"
            }
            featured
            state={resultImageUrl ? "ready" : isRunning ? "active" : "empty"}
          />
        {state.status === "COMPLETED" ? (
          <Button
            className="w-full"
            disabled={downloading}
            onClick={onDownload}
            size="lg"
            type="button"
          >
            <DownloadIcon data-icon="inline-start" />
            {downloading ? "Preparing..." : "Download"}
          </Button>
        ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function VisualTile({
  emptyLabel,
  featured = false,
  imageUrl,
  label,
  state,
  title,
}: {
  emptyLabel: string;
  featured?: boolean;
  imageUrl?: string;
  label: string;
  state: "active" | "empty" | "ready";
  title: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-[#edf3f4]">
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-border/70 bg-background px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">
            {title}
          </div>
          <div className="truncate text-sm font-semibold">{label}</div>
        </div>
        <TileBadge state={state} />
      </div>
      <div
        className={[
          "relative flex aspect-[4/5] items-center justify-center overflow-hidden bg-[#e7eff1]",
          featured ? "min-h-[430px] lg:min-h-[520px]" : "min-h-[360px]",
        ].join(" ")}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex max-w-[220px] flex-col items-center gap-3 px-5 text-center text-sm text-muted-foreground">
            {state === "active" ? (
              <LoaderCircleIcon className="size-7 animate-spin text-[#ff6b1a]" />
            ) : (
              <ImageIcon className="size-7 text-[#7a9ca5]" />
            )}
            <span>{emptyLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function TileBadge({ state }: { state: "active" | "empty" | "ready" }) {
  if (state === "ready") {
    return (
      <Badge variant="secondary" className="gap-1 bg-[#fff1e8] text-[#8f350d]">
        <CheckCircle2Icon className="size-3" />
        Ready
      </Badge>
    );
  }
  if (state === "active") {
    return (
      <Badge variant="secondary" className="gap-1">
        <LoaderCircleIcon className="size-3 animate-spin" />
        Working
      </Badge>
    );
  }
  return <Badge variant="outline">Pending</Badge>;
}

function ProductSummary({
  label,
  imageUrl,
}: {
  label: string;
  imageUrl?: string;
}) {
  return (
    <div className="grid grid-cols-[78px_1fr] gap-4 rounded-lg border border-border/80 bg-[#edf5f5] p-3">
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

function StatePanel({
  active = false,
  title,
  body,
}: {
  active?: boolean;
  title: string;
  body?: string;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-[#edf5f5] px-4 py-5">
      <div className="flex items-center gap-2 font-semibold">
        {active ? (
          <LoaderCircleIcon className="size-4 animate-spin text-[#ff6b1a]" />
        ) : null}
        {title}
      </div>
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

function statusLabel(state: PageState): string {
  if (state.status === "LOADING") {
    return "Preparing";
  }
  if (state.status === "READY") {
    return "Product ready";
  }
  if (state.status === "PHOTO_READY") {
    return "Photo ready";
  }
  if (state.status === "RUNNING") {
    return "Generating";
  }
  if (state.status === "COMPLETED") {
    return "Complete";
  }
  return "Unavailable";
}

function downloadFilename(run: ShopifyTryOnRun): string {
  const extension =
    run.result?.contentType === "image/png"
      ? "png"
      : run.result?.contentType === "image/webp"
        ? "webp"
        : "jpg";
  return `selfx-try-on-${run.id}.${extension}`;
}

function messageFor(error: unknown): string {
  if (error instanceof SafeApiError) {
    if (error.code === "SELFX_CREDITS_EXHAUSTED") {
      return tryOnTemporarilyUnavailableMessage;
    }
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

function runFailureMessage(run: ShopifyTryOnRun): string {
  if (run.errorCode === "SELFX_CREDITS_EXHAUSTED") {
    return tryOnTemporarilyUnavailableMessage;
  }
  return run.errorMessage ?? "Try-On could not be completed.";
}
