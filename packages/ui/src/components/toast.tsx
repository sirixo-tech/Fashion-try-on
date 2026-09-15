"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@selfx/ui/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type ToastRecord = Required<Pick<ToastInput, "title" | "variant">> &
  Pick<ToastInput, "description"> & {
    id: string;
  };

type ToastContextValue = {
  showToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
};

const TOAST_DURATION_MS = 5000;
const ToastContext = createContext<ToastContextValue | null>(null);

let toastSequence = 0;

function nextToastId(): string {
  toastSequence += 1;
  return `selfx-toast-${Date.now()}-${toastSequence}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const clearToasts = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback((toast: ToastInput) => {
    const id = nextToastId();
    setToasts((current) =>
      [
        ...current,
        {
          id,
          title: toast.title,
          description: toast.description,
          variant: toast.variant ?? "info",
        },
      ].slice(-5),
    );
    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast, clearToasts }),
    [clearToasts, dismissToast, showToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport dismissToast={dismissToast} toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    return {
      showToast: () => "",
      dismissToast: () => undefined,
      clearToasts: () => undefined,
    };
  }
  return value;
}

function ToastViewport({
  dismissToast,
  toasts,
}: {
  dismissToast: (id: string) => void;
  toasts: ToastRecord[];
}) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="fixed right-4 top-4 z-50 grid w-[min(26rem,calc(100vw-2rem))] gap-3"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          dismissToast={dismissToast}
        />
      ))}
    </div>
  );
}

function ToastItem({
  dismissToast,
  toast,
}: {
  dismissToast: (id: string) => void;
  toast: ToastRecord;
}) {
  useEffect(() => {
    const timer = window.setTimeout(
      () => dismissToast(toast.id),
      TOAST_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [dismissToast, toast.id]);

  const Icon = iconForVariant(toast.variant);
  const styles = stylesForVariant(toast.variant);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card p-4 pr-12 text-card-foreground shadow-soft ring-1 ring-foreground/5",
        styles.container,
      )}
      role={toast.variant === "error" ? "alert" : "status"}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            styles.iconFrame,
          )}
        >
          <Icon className={cn("size-5", styles.icon)} aria-hidden="true" />
        </span>
        <div className="min-w-0 pt-1">
          <div className="font-semibold leading-5">{toast.title}</div>
          {toast.description ? (
            <div className="mt-1 text-sm leading-5 text-muted-foreground">
              {toast.description}
            </div>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="absolute right-3 top-3 grid size-8 place-items-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
        aria-label="Dismiss notification"
        onClick={() => dismissToast(toast.id)}
      >
        <XIcon className="size-4" aria-hidden="true" />
      </button>
      <div className="absolute inset-x-0 bottom-0 h-1 bg-muted">
        <div
          className={cn(
            "h-full origin-left animate-[selfx-toast-progress_5000ms_linear_forwards]",
            styles.progress,
          )}
        />
      </div>
    </div>
  );
}

function iconForVariant(variant: ToastVariant): LucideIcon {
  if (variant === "success") return CheckCircle2Icon;
  if (variant === "error") return AlertCircleIcon;
  if (variant === "warning") return TriangleAlertIcon;
  return InfoIcon;
}

function stylesForVariant(variant: ToastVariant): {
  container: string;
  iconFrame: string;
  icon: string;
  progress: string;
} {
  if (variant === "success") {
    return {
      container: "border-emerald-300",
      iconFrame: "bg-emerald-100",
      icon: "text-emerald-700",
      progress: "bg-emerald-500",
    };
  }
  if (variant === "error") {
    return {
      container: "border-destructive/30",
      iconFrame: "bg-destructive/10",
      icon: "text-destructive",
      progress: "bg-destructive",
    };
  }
  if (variant === "warning") {
    return {
      container: "border-warning/50",
      iconFrame: "bg-warning/20",
      icon: "text-warning-foreground",
      progress: "bg-warning",
    };
  }
  return {
    container: "border-sky-300",
    iconFrame: "bg-sky-100",
    icon: "text-sky-700",
    progress: "bg-sky-500",
  };
}
