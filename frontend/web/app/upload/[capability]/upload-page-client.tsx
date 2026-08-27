"use client";

import { useEffect, useRef, useState } from "react";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@selfx/ui";

import { SafeApiError } from "@/lib/api";
import {
  completeCustomerUpload,
  createCustomerUploadIntent,
  getCustomerUploadStatus,
  uploadCustomerPhotoToStorage,
  type CustomerUploadPurpose,
  type CustomerUploadStatus,
} from "@/lib/customer-upload-api";

const supportedTypes = ["image/jpeg", "image/png", "image/webp"];

export function CustomerUploadPageClient({
  capability,
}: {
  capability: string;
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

  useEffect(() => {
    let cancelled = false;
    getCustomerUploadStatus(capability)
      .then((next) => {
        if (cancelled) {
          return;
        }
        setStatus(next.status);
        setPurpose(next.purpose);
        setMaxImageBytes(next.maxImageBytes);
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("EXPIRED");
        }
      });
    return () => {
      cancelled = true;
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
    if (!nextFile) {
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
    if (!file || busy) {
      return;
    }
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
    } finally {
      setBusy(false);
    }
  }

  const expired =
    status === "EXPIRED" ||
    status === "CANCELLED" ||
    status === "CONSUMED";
  const sent = status === "READY";
  const copy = uploadCopyFor(purpose);

  return (
    <main className="min-h-screen bg-background px-5 py-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center">
        <div className="mb-8 flex justify-center">
          <img
            src="/brand/selfx-logo.png"
            alt="SelfX"
            className="h-14 w-auto max-w-48 object-contain"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{copy.title}</CardTitle>
            <CardDescription>{copy.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {expired ? (
              <UploadState
                title="Upload link expired"
                body="Return to the kiosk and scan a new QR code."
              />
            ) : sent ? (
              <UploadState
                title="Photo sent to the kiosk"
                body="You can return to the kiosk now."
              />
            ) : (
              <>
                <input
                  ref={cameraInput}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture={purpose === "MODEL" ? "user" : "environment"}
                  onChange={(event) => selectFile(event.target.files?.[0])}
                />
                <input
                  ref={galleryInput}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => selectFile(event.target.files?.[0])}
                />

                {previewUrl ? (
                  <div className="overflow-hidden rounded-lg border bg-muted">
                    <img
                      src={previewUrl}
                      alt="Selected photo preview"
                      className="max-h-[52vh] w-full object-contain"
                    />
                  </div>
                ) : null}

                {message ? (
                  <div className="rounded-lg border bg-muted px-4 py-3 text-sm">
                    {message}
                  </div>
                ) : null}

                <div className="grid gap-3">
                  {file ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => galleryInput.current?.click()}
                      >
                        Choose Another
                      </Button>
                      <Button type="button" disabled={busy} onClick={upload}>
                        {busy ? "Uploading" : "Upload Photo"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        onClick={() => cameraInput.current?.click()}
                      >
                        Take Photo
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => galleryInput.current?.click()}
                      >
                        Choose from Phone
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function uploadCopyFor(purpose: CustomerUploadPurpose): {
  title: string;
  description: string;
} {
  if (purpose === "GARMENT") {
    return {
      title: "Add garment photo",
      description:
        "Take or choose a clear photo of the outfit you want to try. The outfit should be clearly visible on one person.",
    };
  }
  return {
    title: "Add your photo",
    description:
      "Take a clear photo of yourself or choose one from your phone.",
  };
}

function UploadState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-muted px-4 py-5">
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm text-muted-foreground">{body}</div>
    </div>
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
