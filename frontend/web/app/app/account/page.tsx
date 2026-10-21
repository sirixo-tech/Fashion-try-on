"use client";
import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Label,
  PageContainer,
  PageHeader,
  SectionCard,
  SelectMenu,
} from "@selfx/ui";
import {
  formatRegionalDate,
  useRegionalSettings,
  type RegionalSettings,
} from "@/lib/regional-settings";

export default function AccountPage() {
  const { settings, loading, error, save, reload } = useRegionalSettings();
  const [draft, setDraft] = useState(settings),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setDraft(settings), [settings]);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const zones = (
    Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf?.("timeZone") ?? [
    "UTC",
    "Asia/Kolkata",
    "Europe/London",
    "America/New_York",
  ];
  const deviceZone = now
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : "device time zone";
  let preview = "Choose a valid time zone.";
  let validTimezone = true;
  try {
    if (now) preview = formatRegionalDate(now, draft);
  } catch {
    // Keep the validation guidance visible while a time zone is being typed.
    validTimezone = false;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await save(draft);
      setMessage("Regional settings saved.");
    } catch (caught) {
      setMessage(
        caught instanceof Error ? caught.message : "Could not save settings.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <PageContainer width="form">
      <PageHeader
        title="Account"
        description="Personal display preferences for your SelfX account."
      />
      <SectionCard
        title="Regional Settings"
        description="Choose how dates and times appear across your workspace."
      >
        {error && (
          <p role="alert" className="mb-4 text-destructive">
            {error}{" "}
            <Button variant="link" onClick={reload}>
              Retry
            </Button>
          </p>
        )}
        <form onSubmit={submit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="regional-timezone">Time zone</Label>
            <Input
              id="regional-timezone"
              list="regional-timezones"
              placeholder={`Automatic · ${deviceZone}`}
              value={draft.timezone ?? ""}
              aria-invalid={!validTimezone}
              disabled={loading || busy}
              onChange={(e) =>
                setDraft({ ...draft, timezone: e.target.value || null })
              }
            />
            <datalist id="regional-timezones">
              {zones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Leave empty to use the time zone of the current device.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="regional-date-format">Date format</Label>
              <SelectMenu
                id="regional-date-format"
                ariaLabel="Date format"
                value={draft.dateFormat}
                disabled={loading || busy}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    dateFormat: value as RegionalSettings["dateFormat"],
                  })
                }
                options={[
                  { value: "AUTO", label: "Automatic" },
                  { value: "DMY", label: "DD/MM/YYYY" },
                  { value: "MDY", label: "MM/DD/YYYY" },
                  { value: "YMD", label: "YYYY-MM-DD" },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="regional-time-format">Time format</Label>
              <SelectMenu
                id="regional-time-format"
                ariaLabel="Time format"
                value={draft.timeFormat}
                disabled={loading || busy}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    timeFormat: value as RegionalSettings["timeFormat"],
                  })
                }
                options={[
                  { value: "AUTO", label: "Automatic" },
                  { value: "H12", label: "12-hour" },
                  { value: "H24", label: "24-hour" },
                ]}
              />
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">Preview</p>
            <p className="mt-2 font-semibold">{preview}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {draft.timezone || deviceZone}
            </p>
          </div>
          <p className="text-sm text-muted-foreground">
            These preferences follow your account across devices. Store
            schedules and billing periods keep their configured time zones.
          </p>
          {message && <p role="status">{message}</p>}
          <Button
            disabled={
              loading ||
              busy ||
              !!error ||
              JSON.stringify(settings) === JSON.stringify(draft) ||
              !validTimezone
            }
            type="submit"
          >
            {busy ? "Saving…" : "Save regional settings"}
          </Button>
        </form>
      </SectionCard>
    </PageContainer>
  );
}
