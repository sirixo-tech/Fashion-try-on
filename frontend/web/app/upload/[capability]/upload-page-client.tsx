"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";

import { Button } from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  completeCustomerUpload,
  createCustomerUploadIntent,
  getCustomerUploadStatus,
  uploadCustomerPhotoToStorage,
  type CustomerUploadPurpose,
  type CustomerUploadStatus,
} from "@/lib/customer-upload-api";

import styles from "./upload-page.module.css";
import { useUploadCamera } from "./use-upload-camera";

const supportedTypes = ["image/jpeg", "image/png", "image/webp"];

export function CustomerUploadPageClient({
  capability,
  jewelleryType,
}: {
  capability: string;
  jewelleryType?: string;
}) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<CustomerUploadStatus | "LOADING">(
    "LOADING",
  );
  const [maxImageBytes, setMaxImageBytes] = useState(8 * 1024 * 1024);
  const [purpose, setPurpose] = useState<CustomerUploadPurpose>("MODEL");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [validatedCapability, setValidatedCapability] = useState<string | null>(
    null,
  );
  const uploadLock = useRef(false);
  const expired =
    status === "EXPIRED" || status === "CANCELLED" || status === "CONSUMED";
  const sent = status === "READY";
  const defaultFacingMode =
    purpose === "MODEL" &&
    jewelleryType !== "RING" &&
    jewelleryType !== "BRACELET"
      ? "user"
      : "environment";
  const camera = useUploadCamera({
    enabled:
      validatedCapability === capability &&
      !expired &&
      !sent &&
      status !== "LOADING" &&
      !file &&
      !busy,
    defaultFacingMode,
  });

  useEffect(() => {
    let cancelled = false;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    setStatus("LOADING");
    setFile(null);
    setMessage(null);
    getCustomerUploadStatus(capability)
      .then((next) => {
        if (cancelled) {
          return;
        }
        const remaining =
          Date.parse(next.expiresAt) - Date.parse(next.serverTime);
        setStatus(
          next.status !== "READY" && remaining <= 0 ? "EXPIRED" : next.status,
        );
        setPurpose(next.purpose);
        setMaxImageBytes(next.maxImageBytes);
        setValidatedCapability(capability);
        if (Number.isFinite(remaining) && remaining > 0) {
          expiryTimer = setTimeout(
            () => {
              if (!cancelled)
                setStatus((current) =>
                  current === "READY" ? current : "EXPIRED",
                );
            },
            Math.max(0, remaining),
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("EXPIRED");
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(expiryTimer);
    };
  }, [capability]);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const nextPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [file]);

  function selectFile(nextFile: File | undefined) {
    setMessage(null);
    if (
      !nextFile ||
      expired ||
      sent ||
      busy ||
      validatedCapability !== capability
    ) {
      return;
    }
    if (nextFile.size <= 0) {
      setMessage("Invalid image.");
      return;
    }
    if (nextFile.size > maxImageBytes) {
      setMessage("File too large.");
      return;
    }
    if (!supportedTypes.includes(nextFile.type)) {
      setMessage("Invalid image.");
      return;
    }
    setFile(nextFile);
    setStatus("WAITING");
  }

  async function upload() {
    if (!file || busy || uploadLock.current || expired || sent) {
      return;
    }
    uploadLock.current = true;
    setBusy(true);
    setMessage("Uploading your photo...");
    try {
      const intent = await createCustomerUploadIntent(capability, file);
      await uploadCustomerPhotoToStorage(intent, file);
      setMessage("Validating photo...");
      const completed = await completeCustomerUpload(capability);
      setStatus(completed.status);
      setMessage(
        completed.status === "READY"
          ? "Photo sent to the kiosk"
          : "Photo could not be processed",
      );
    } catch (error) {
      setMessage(messageFor(error));
      if (
        error instanceof SafeApiError &&
        error.code === "KIOSK_CUSTOMER_UPLOAD_EXPIRED"
      ) {
        setStatus("EXPIRED");
      }
    } finally {
      uploadLock.current = false;
      setBusy(false);
    }
  }

  const jewelleryGuidance =
    purpose === "MODEL" ? jewelleryUploadGuidance(jewelleryType) : null;
  const copy = jewelleryGuidance ?? uploadCopyFor(purpose);
  const guidance = guidanceFor(purpose, jewelleryType);
  const unavailable =
    validatedCapability !== capability ||
    status === "LOADING" ||
    busy ||
    camera.state === "capturing";

  async function takePhoto() {
    if (camera.state === "ready") {
      const captured = await camera.capture();
      if (captured) selectFile(captured);
    } else {
      cameraInput.current?.click();
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <Button
            type="button"
            variant="ghost"
            className={styles.back}
            disabled={busy}
            onClick={() => {
              if (window.history.length > 1) {
                camera.stop();
                window.history.back();
              } else {
                setMessage("You can close this page and return to the kiosk.");
              }
            }}
          >
            <UploadIcon name="back" />
            Back
          </Button>
          <Image
            src="/brand/selfx-logo.png"
            alt="SelfX — Make your business standout"
            width={1380}
            height={513}
            className={styles.logo}
          />
        </header>

        <section aria-labelledby="upload-title" className={styles.upload}>
          <h1 id="upload-title" className={styles.accessibleTitle}>
            {copy.title}
          </h1>

          {expired ? (
            <UploadState
              title="Upload link expired"
              body="Return to the kiosk and scan a new QR code."
            />
          ) : sent ? (
            <UploadState
              title="Photo sent to the kiosk"
              body="You can return to the kiosk now."
              success
            />
          ) : (
            <>
              <input
                ref={cameraInput}
                className={styles.hiddenInput}
                aria-label="Take a photo with your camera"
                type="file"
                disabled={unavailable}
                accept="image/jpeg,image/png,image/webp"
                capture={defaultFacingMode}
                onChange={(event) => {
                  selectFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
              <input
                ref={galleryInput}
                className={styles.hiddenInput}
                aria-label="Choose a photo from your phone"
                type="file"
                disabled={unavailable}
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  selectFile(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />

              <div className={styles.previewArea}>
                <div className={styles.preview}>
                  {previewUrl ? (
                    // Keep the local blob preview in the browser, outside image optimization.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewUrl}
                      alt="Selected photo preview"
                      className={styles.photo}
                    />
                  ) : (
                    <>
                      <video
                        ref={camera.videoRef}
                        aria-label="Live camera preview"
                        className={`${styles.liveVideo} ${camera.facingMode === "user" ? styles.mirrored : ""}`}
                        autoPlay
                        muted
                        playsInline
                        onLoadedData={camera.previewReady}
                        onCanPlay={camera.previewReady}
                      />
                      {camera.state !== "ready" &&
                        camera.state !== "capturing" && (
                          <div
                            className={styles.placeholder}
                            aria-live="polite"
                          >
                            <UploadIcon
                              name={
                                purpose === "GARMENT"
                                  ? "shirt"
                                  : jewelleryType === "RING" ||
                                      jewelleryType === "BRACELET"
                                    ? "hand"
                                    : "person"
                              }
                            />
                            <span>
                              {status === "LOADING"
                                ? "Preparing photo upload…"
                                : camera.state === "starting"
                                  ? "Allow camera access to see your live preview…"
                                  : (camera.message ??
                                    "Your photo will appear here")}
                            </span>
                          </div>
                        )}
                    </>
                  )}
                  <span className={styles.corners} aria-hidden="true" />
                </div>
                {!file && camera.state === "ready" && (
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.cameraSwitch}
                    onClick={camera.switchCamera}
                    disabled={unavailable}
                  >
                    <UploadIcon name="switch" /> Switch Camera
                  </Button>
                )}
              </div>

              {jewelleryGuidance && (
                <p className={styles.description}>
                  {jewelleryGuidance.description}
                </p>
              )}
              <ul className={styles.guidance} aria-label="Photo tips">
                {guidance.map((tip) => (
                  <li key={tip.label}>
                    <span className={styles.tipIcon}>
                      <UploadIcon name={tip.icon} />
                    </span>
                    <span>{tip.label}</span>
                  </li>
                ))}
              </ul>

              {message ? (
                <p className={styles.message} role="status">
                  {message}
                </p>
              ) : null}
              {!file && camera.state === "ready" && camera.message && (
                <p className={styles.message} role="status">
                  {camera.message}
                </p>
              )}

              <div className={styles.actions} aria-busy={busy}>
                <Button
                  type="button"
                  className={styles.primaryAction}
                  disabled={
                    unavailable || (!file && camera.state === "starting")
                  }
                  onClick={file ? upload : takePhoto}
                >
                  <UploadIcon name={file ? "upload" : "camera"} />
                  <span>
                    {file
                      ? busy
                        ? "Uploading"
                        : "Upload Photo"
                      : camera.state === "capturing"
                        ? "Capturing…"
                        : "Take Photo"}
                  </span>
                  <UploadIcon name="next" />
                </Button>
                {file && (
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.secondaryAction}
                    disabled={unavailable}
                    onClick={() => {
                      setFile(null);
                      setMessage(null);
                    }}
                  >
                    <UploadIcon name="camera" />
                    <span>Retake Photo</span>
                    <span aria-hidden="true" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  className={styles.secondaryAction}
                  disabled={unavailable}
                  onClick={() => galleryInput.current?.click()}
                >
                  <UploadIcon name="gallery" />
                  <span>{file ? "Choose Another" : "Choose from Phone"}</span>
                  <UploadIcon name="next" />
                </Button>
              </div>
            </>
          )}
          {(expired || sent) &&
          message &&
          message !== "Photo sent to the kiosk" ? (
            <p className={styles.message} role="status">
              {message}
            </p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function jewelleryUploadGuidance(type?: string) {
  // URL hints affect framing copy only; the upload capability authorizes access.
  switch (type) {
    case "RING":
      return {
        title: "Add Your Hand Photo",
        description:
          "Keep your hand open and steady, with your fingers clearly visible.",
      };
    case "BRACELET":
      return {
        title: "Add Your Wrist Photo",
        description:
          "Keep your wrist and lower forearm clearly visible, with your sleeve moved aside.",
      };
    case "NECKLACE":
      return {
        title: "Add Your Photo",
        description:
          "Keep your neck, shoulders and upper chest visible. Move hair away from your neckline.",
      };
    case "EARRING":
      return {
        title: "Add Your Photo",
        description:
          "Keep your face and at least one ear clearly visible. Move hair away from the visible ear.",
      };
    default:
      return null;
  }
}

function uploadCopyFor(purpose: CustomerUploadPurpose): {
  title: string;
  description: string;
} {
  if (purpose === "GARMENT") {
    return {
      title: "Add Garment Photo",
      description:
        "Take or choose a clear photo of the outfit you want to try. The outfit should be clearly visible on one person.",
    };
  }
  return {
    title: "Add Your Photo",
    description:
      "Take a clear photo of yourself or choose one from your phone to try different styles.",
  };
}

function UploadState({
  title,
  body,
  success = false,
}: {
  title: string;
  body: string;
  success?: boolean;
}) {
  return (
    <div className={styles.state} role="status">
      <span className={styles.tipIcon}>
        <UploadIcon name={success ? "check" : "clock"} />
      </span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

type UploadIconName =
  | "back"
  | "next"
  | "camera"
  | "gallery"
  | "person"
  | "shirt"
  | "face"
  | "hand"
  | "upload"
  | "check"
  | "clock"
  | "switch";

function guidanceFor(
  purpose: CustomerUploadPurpose,
  type?: string,
): { icon: UploadIconName; label: string }[] {
  if (purpose === "GARMENT") {
    return [
      { icon: "person", label: "Well-lit Photo" },
      { icon: "shirt", label: "One Person" },
      { icon: "gallery", label: "Outfit Clearly Visible" },
    ];
  }
  if (type === "RING" || type === "BRACELET") {
    return [
      { icon: "person", label: "Well-lit Photo" },
      { icon: "hand", label: "Keep Hand Steady" },
      {
        icon: "gallery",
        label:
          type === "RING" ? "Fingers Clearly Visible" : "Wrist Clearly Visible",
      },
    ];
  }
  return [
    { icon: "person", label: "Well-lit Photo" },
    {
      icon: "shirt",
      label:
        type === "NECKLACE"
          ? "Neckline Visible"
          : type === "EARRING"
            ? "Ear Clearly Visible"
            : "Stand Straight",
    },
    {
      icon: "face",
      label:
        type === "NECKLACE" || type === "EARRING"
          ? "Move Hair Aside"
          : "Face Clearly Visible",
    },
  ];
}

function UploadIcon({ name }: { name: UploadIconName }) {
  const paths: Record<UploadIconName, ReactNode> = {
    switch: (
      <path d="M3 10a9 9 0 0 1 15-6l3 3M21 2v5h-5M21 14A9 9 0 0 1 6 20l-3-3M3 22v-5h5" />
    ),
    back: <path d="m12 5-7 7 7 7M5 12h15" />,
    next: <path d="m9 5 7 7-7 7" />,
    camera: (
      <>
        <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z" />
        <circle cx="12" cy="13" r="4" />
      </>
    ),
    gallery: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="8" cy="8" r="1" />
        <path d="m3 17 5-5 4 4 4-6 5 5" />
      </>
    ),
    person: (
      <>
        <circle cx="12" cy="7" r="4" />
        <path d="M3 21v-2a9 9 0 0 1 18 0v2z" />
      </>
    ),
    shirt: <path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0Z" />,
    face: (
      <>
        <path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m13-5v3a2 2 0 0 1-2 2h-3M8 14s1 3 4 3 4-3 4-3" />
        <circle cx="8" cy="9" r=".5" />
        <circle cx="16" cy="9" r=".5" />
      </>
    ),
    hand: (
      <path d="M8 12V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v9a6 6 0 0 1-6 6h-2a5 5 0 0 1-4-2l-5-6a2 2 0 0 1 3-3l2 2" />
    ),
    upload: (
      <>
        <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />
      </>
    ),
    check: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="m7 12 3 3 7-7" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function messageFor(error: unknown): string {
  if (error instanceof SafeApiError) {
    if (error.code === "KIOSK_CUSTOMER_UPLOAD_EXPIRED") {
      return "Upload link expired.";
    }
    if (error.code === "KIOSK_CUSTOMER_UPLOAD_REJECTED") {
      return "Invalid image.";
    }
  }
  return "Upload failed. Check your connection and try again.";
}
