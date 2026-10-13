"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type FacingMode = "user" | "environment";
type CameraState = "idle" | "starting" | "ready" | "capturing" | "error";

/** Local preview/capture only. This hook never uploads or records video/audio. */
export function useUploadCamera({
  enabled,
  defaultFacingMode,
}: {
  enabled: boolean;
  defaultFacingMode: FacingMode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const generation = useRef(0);
  const capturing = useRef(false);
  const [selectedFacingMode, setSelectedFacingMode] =
    useState<FacingMode | null>(null);
  const facingMode = selectedFacingMode ?? defaultFacingMode;
  const [state, setState] = useState<CameraState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(true);

  const stop = useCallback(() => {
    generation.current++;
    capturing.current = false;
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    const visibilityChanged = () => {
      if (document.hidden) stop();
      setVisible(!document.hidden);
    };
    const pageHidden = () => {
      stop();
      setVisible(false);
    };
    const pageShown = () => setVisible(!document.hidden);
    visibilityChanged();
    document.addEventListener("visibilitychange", visibilityChanged);
    window.addEventListener("pagehide", pageHidden);
    window.addEventListener("pageshow", pageShown);
    return () => {
      document.removeEventListener("visibilitychange", visibilityChanged);
      window.removeEventListener("pagehide", pageHidden);
      window.removeEventListener("pageshow", pageShown);
    };
  }, [stop]);

  useEffect(() => {
    stop();
    const request = generation.current;
    let active = true;
    let stream: MediaStream | null = null;
    const ended = () => {
      if (!active || request !== generation.current) return;
      stop();
      setState("error");
      setMessage("Camera stopped. Use Take Photo or choose from your phone.");
    };

    async function start() {
      if (!enabled || !visible || document.hidden) {
        setState("idle");
        return;
      }
      setMessage(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setState("error");
        setMessage(
          "Live camera is unavailable. Use Take Photo or choose from your phone.",
        );
        return;
      }
      setState("starting");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (!active || request !== generation.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) throw new Error("PREVIEW_UNAVAILABLE");
        streamRef.current = stream;
        stream
          .getVideoTracks()
          .forEach((track) => track.addEventListener("ended", ended));
        video.srcObject = stream;
        await video.play();
        if (
          active &&
          request === generation.current &&
          video.videoWidth > 0 &&
          video.videoHeight > 0
        ) {
          setState("ready");
        }
      } catch (error) {
        stream?.getTracks().forEach((track) => track.stop());
        if (!active || request !== generation.current) return;
        stop();
        setState("error");
        setMessage(
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Camera access was not allowed. Use Take Photo or choose from your phone."
            : "Could not open the camera. Use Take Photo or choose from your phone.",
        );
      }
    }
    void start();
    return () => {
      active = false;
      stream
        ?.getVideoTracks()
        .forEach((track) => track.removeEventListener("ended", ended));
      stop();
    };
  }, [enabled, facingMode, visible, stop]);

  function previewReady() {
    const video = videoRef.current;
    if (
      streamRef.current &&
      video?.srcObject === streamRef.current &&
      video.videoWidth > 0 &&
      video.videoHeight > 0 &&
      !capturing.current
    ) {
      setState("ready");
    }
  }

  async function capture(): Promise<File | null> {
    const video = videoRef.current;
    if (
      !enabled ||
      !visible ||
      state !== "ready" ||
      capturing.current ||
      !video ||
      !video.videoWidth ||
      !video.videoHeight ||
      !streamRef.current
    )
      return null;
    const request = generation.current;
    capturing.current = true;
    setState("capturing");
    setMessage(null);
    try {
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        2048 / Math.max(video.videoWidth, video.videoHeight),
      );
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("CAPTURE_UNAVAILABLE");
      // Preserve the full, unmirrored frame; CSS mirroring is preview-only.
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92),
      );
      if (request !== generation.current) return null;
      if (!blob) throw new Error("CAPTURE_UNAVAILABLE");
      return new File([blob], "selfx-camera-photo.jpg", { type: "image/jpeg" });
    } catch {
      if (request === generation.current)
        setMessage(
          "Could not capture the photo. Try again or choose from your phone.",
        );
      return null;
    } finally {
      if (request === generation.current) {
        capturing.current = false;
        setState("ready");
      }
    }
  }

  return {
    videoRef,
    state,
    message,
    facingMode,
    capture,
    previewReady,
    stop,
    switchCamera: () =>
      setSelectedFacingMode(facingMode === "user" ? "environment" : "user"),
  };
}
