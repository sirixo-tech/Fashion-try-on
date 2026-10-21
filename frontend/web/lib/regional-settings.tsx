"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { selfxApi } from "./api";
import { useSession } from "./session";

export type RegionalSettings = {
  timezone: string | null;
  dateFormat: "AUTO" | "DMY" | "MDY" | "YMD";
  timeFormat: "AUTO" | "H12" | "H24";
};
export const defaultRegionalSettings: RegionalSettings = {
  timezone: null,
  dateFormat: "AUTO",
  timeFormat: "AUTO",
};
export function formatRegionalDate(
  value: string | Date,
  settings: RegionalSettings = defaultRegionalSettings,
  kind: "datetime" | "date" | "time" = "datetime",
  calendarDate = false,
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const timeZone = calendarDate ? "UTC" : (settings.timezone ?? undefined);
  const locale = typeof navigator === "undefined" ? "en" : navigator.language;
  const options: Intl.DateTimeFormatOptions = { timeZone };
  if (kind !== "time") {
    options.year = "numeric";
    options.month = settings.dateFormat === "AUTO" ? "short" : "2-digit";
    options.day = settings.dateFormat === "AUTO" ? "numeric" : "2-digit";
  }
  if (kind !== "date") {
    options.hour = "2-digit";
    options.minute = "2-digit";
    if (settings.timeFormat !== "AUTO")
      options.hour12 = settings.timeFormat === "H12";
  }
  if (kind === "time" || settings.dateFormat === "AUTO")
    return new Intl.DateTimeFormat(locale, options).format(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "";
  const order =
    settings.dateFormat === "DMY"
      ? ["day", "month", "year"]
      : settings.dateFormat === "MDY"
        ? ["month", "day", "year"]
        : ["year", "month", "day"];
  const formatted = order
    .map(part)
    .join(settings.dateFormat === "YMD" ? "-" : "/");
  return kind === "date"
    ? formatted
    : `${formatted}, ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: settings.timeFormat === "AUTO" ? undefined : settings.timeFormat === "H12", timeZone }).format(date)}`;
}
const RegionalContext = createContext<{
  settings: RegionalSettings;
  loading: boolean;
  error: string;
  save: (settings: RegionalSettings) => Promise<void>;
  reload: () => void;
}>({
  settings: defaultRegionalSettings,
  loading: false,
  error: "",
  save: async () => {
    throw new Error("Sign in to save regional settings.");
  },
  reload: () => {},
});
export function RegionalSettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const session = useSession();
  const [record, setRecord] = useState<{
    userId: string;
    settings: RegionalSettings;
  } | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const userId = session.user?.id;
  const token = session.accessToken;
  useEffect(() => {
    if (!token || !userId) {
      setRecord(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError("");
    void selfxApi<RegionalSettings>("/api/v1/account/regional-settings", {
      accessToken: token,
    })
      .then((settings) => {
        if (active) setRecord({ userId, settings });
      })
      .catch(() => {
        if (active)
          setError(
            "Regional settings could not be loaded. Retry to load your saved preferences.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId, token, retry]);
  async function save(settings: RegionalSettings) {
    if (!token || !userId)
      throw new Error("Sign in to save regional settings.");
    const result = await selfxApi<RegionalSettings>(
      "/api/v1/account/regional-settings",
      { accessToken: token, method: "PATCH", body: JSON.stringify(settings) },
    );
    setRecord({ userId, settings: result });
    setError("");
  }
  return (
    <RegionalContext.Provider
      value={{
        settings:
          record && record.userId === userId
            ? record.settings
            : defaultRegionalSettings,
        loading:
          loading || Boolean(userId && record?.userId !== userId && !error),
        error,
        save,
        reload: () => setRetry((n) => n + 1),
      }}
    >
      {children}
    </RegionalContext.Provider>
  );
}
export const useRegionalSettings = () => useContext(RegionalContext);
export function RegionalDateTime({
  value,
  kind = "datetime",
  calendarDate = false,
}: {
  value: string | Date;
  kind?: "datetime" | "date" | "time";
  calendarDate?: boolean;
}) {
  const { settings } = useRegionalSettings();
  // Hydrate with one stable locale, then apply the browser's automatic preferences.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return <span>—</span>;
  return <span>{formatRegionalDate(value, settings, kind, calendarDate)}</span>;
}
