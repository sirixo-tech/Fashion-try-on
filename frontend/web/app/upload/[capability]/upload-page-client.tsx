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
  const uploadDeadline = useRef<number | null>(null);
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
    uploadDeadline.current = null;
    setFile(null);
    setMessage(null);
    getCustomerUploadStatus(capability)
      .then((next) => {
        if (cancelled) {
          return;
        }
        const remaining =
          Date.parse(next.expiresAt) - Date.parse(next.serverTime);
        uploadDeadline.current = Number.isFinite(remaining)
          ? Date.now() + remaining
          : null;
        setStatus(
          next.status !== "READY" && remaining <= 0 ? "EXPIRED" : next.status,
        );
        setPurpose(next.purpose);
        setMaxImageBytes(next.maxImageBytes);
        setValidatedCapability(capability);
        if (Number.isFinite(remaining) && remaining > 0) {
          expiryTimer = setTimeout(
            () => {
              if (!cancelled) {
                setStatus((current) =>
                  current === "READY" ? current : "EXPIRED",
                );
                setMessage(null);
              }
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

  function deadlinePassed() {
    return (
      uploadDeadline.current !== null && Date.now() >= uploadDeadline.current
    );
  }

  function expireUpload() {
    setStatus("EXPIRED");
    setMessage(null);
  }

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
    // Mobile browsers can suspend timers while the page is in the background.
    if (deadlinePassed()) {
      expireUpload();
      return;
    }
    uploadLock.current = true;
    setBusy(true);
    setMessage("Uploading your photo...");
    try {
      const intent = await createCustomerUploadIntent(capability, file);
      if (deadlinePassed()) {
        expireUpload();
        return;
      }
      await uploadCustomerPhotoToStorage(intent, file);
      if (deadlinePassed()) {
        expireUpload();
        return;
      }
      setMessage("Validating photo...");
      const completed = await completeCustomerUpload(capability);
      setStatus(completed.status);
      setMessage(
        completed.status === "READY"
          ? "Photo sent to the kiosk"
          : "Photo could not be processed",
      );
    } catch (error) {
      if (
        deadlinePassed() ||
        (error instanceof SafeApiError &&
          error.code === "KIOSK_CUSTOMER_UPLOAD_EXPIRED")
      ) {
        expireUpload();
        return;
      }
      // Storage failures do not carry the SelfX expiry code. Ask SelfX before
      // reporting a connection error or offering another upload attempt.
      try {
        const current = await getCustomerUploadStatus(capability);
        if (
          current.status === "EXPIRED" ||
          current.status === "CANCELLED" ||
          current.status === "CONSUMED" ||
          (current.status !== "READY" &&
            Date.parse(current.expiresAt) <= Date.parse(current.serverTime))
        ) {
          expireUpload();
          return;
        }
      } catch (statusError) {
        if (
          statusError instanceof SafeApiError &&
          statusError.code === "KIOSK_CUSTOMER_UPLOAD_EXPIRED"
        ) {
          expireUpload();
          return;
        }
      }
      if (deadlinePassed()) expireUpload();
      else setMessage(messageFor(error));
    } finally {
      uploadLock.current = false;
      setBusy(false);
    }
  }

  const jewelleryGuidance =
    purpose === "MODEL" ? jewelleryUploadGuidance(jewelleryType) : null;
  const copy = jewelleryGuidance ?? uploadCopyFor(purpose);
  const previewGuidance =
    jewelleryGuidance?.description ??
    (purpose === "GARMENT"
      ? "Keep the outfit clearly visible on one person."
      : "Stand straight in good light, with your face clearly visible.");
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
    <main
      className={`${styles.page}${sent ? ` ${styles.successPage}` : !expired ? ` ${styles.capturePage}` : ""}`}
    >
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
              body="Your upload session has expired. Please scan a new QR code on the kiosk to continue."
            />
          ) : sent ? (
            <UploadSuccess />
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
                  <p className={styles.previewGuidance}>{previewGuidance}</p>
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

              <div className={styles.actionDock}>
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

                <div
                  className={`${styles.actions}${file ? ` ${styles.reviewActions}` : ""}`}
                  aria-busy={busy}
                >
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
              </div>
            </>
          )}
          {sent && message && message !== "Photo sent to the kiosk" ? (
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

function UploadSuccess() {
  return (
    <div className={styles.successCard} role="status">
      <svg
        className={styles.successMark}
        viewBox="0 0 240 160"
        aria-hidden="true"
      >
        <circle cx="120" cy="80" r="70" fill="#ffecd8" />
        <circle cx="120" cy="80" r="42" fill="var(--upload-orange)" />
        <path
          d="m100 80 14 14 29-31"
          fill="none"
          stroke="white"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <g
          fill="none"
          stroke="var(--upload-orange)"
          strokeWidth="5"
          strokeLinecap="round"
        >
          <path d="m26 52-9-7M20 80H8m18 28-9 7m197-63 9-7m-3 35h12m-18 28 9 7" />
        </g>
      </svg>
      <h2>Photo sent to the kiosk</h2>
      <p className={styles.successDescription}>
        You can return to the kiosk now.
      </p>
      <hr className={styles.successDivider} />
      <aside className={styles.privacyNote} aria-label="Photo privacy">
        <span className={styles.privacyIcon}>
          <UploadIcon name="lock" />
        </span>
        <div>
          <h3>Secure photo transfer</h3>
          <p>
            Your photo is transferred securely and stored temporarily for your
            Try-On.
          </p>
        </div>
      </aside>
    </div>
  );
}

function UploadState({ title, body }: { title: string; body: string }) {
  return (
    <div className={styles.state} role="status">
      <span className={styles.tipIcon}>
        <UploadIcon name="clock" />
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
  | "lock"
  | "clock"
  | "switch";

function UploadIcon({ name }: { name: UploadIconName }) {
  const paths: Record<UploadIconName, ReactNode> = {
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
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
