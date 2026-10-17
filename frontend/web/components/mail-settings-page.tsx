"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  LoadingState,
  PageContainer,
  PageHeader,
  PageSection,
  SelectMenu,
  Switch,
  TableContainer,
} from "@selfx/ui";
import { useSession } from "@/lib/session";
import { SafeApiError } from "@/lib/api";
import {
  getMailSettings,
  saveMailSettings,
  sendTestEmail,
  type MailSettings,
  type MailSettingsInput,
} from "@/lib/mail-settings";

function draftFor(value: MailSettings): MailSettingsInput {
  return {
    version: value.version,
    enabled: value.enabled,
    host: value.host,
    port: value.port,
    security: value.security,
    username: value.username,
    fromEmail: value.fromEmail,
    fromName: value.fromName,
    ...(value.replyTo ? { replyTo: value.replyTo } : {}),
  };
}
function messageFor(error: unknown) {
  return error instanceof SafeApiError
    ? error.message
    : "The request could not be completed. Try again.";
}
export function MailSettingsPage() {
  const session = useSession(),
    token = session.status === "authenticated" ? session.accessToken : null;
  const [saved, setSaved] = useState<MailSettings | null>(null);
  const [draft, setDraft] = useState<MailSettingsInput | null>(null);
  const [password, setPassword] = useState("");
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError("");
    setNotice("");
    setPassword("");
    try {
      const value = await getMailSettings(token);
      setSaved(value);
      setDraft(draftFor(value));
    } catch (e) {
      setSaved(null);
      setDraft(null);
      setError(messageFor(e));
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);
  const dirty = Boolean(
    saved &&
    draft &&
    (password || JSON.stringify(draft) !== JSON.stringify(draftFor(saved))),
  );
  function update<K extends keyof MailSettingsInput>(
    key: K,
    value: MailSettingsInput[K],
  ) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setNotice("");
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !token) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await saveMailSettings(token, {
        ...draft,
        ...(password ? { password } : {}),
        ...(draft.replyTo ? {} : { replyTo: undefined }),
      });
      setSaved(value);
      setDraft(draftFor(value));
      setNotice(
        "Mail settings saved. Send a test email to check the configuration.",
      );
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  async function test(event: FormEvent) {
    event.preventDefault();
    if (!token || !saved || dirty) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await sendTestEmail(
        token,
        recipient.trim(),
        saved.version,
      );
      setNotice(result.message);
    } catch (e) {
      setError(messageFor(e));
    } finally {
      try {
        setSaved(await getMailSettings(token));
      } catch {
        /* Keep current form and safe result. */
      }
      setBusy(false);
    }
  }
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Platform Settings"
        title="Mail Settings"
        description="Configure outgoing SelfX account emails."
        actions={
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Refresh
          </Button>
        }
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <div role="status">
          <Alert>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      {loading ? (
        <LoadingState label="Loading Mail Settings" />
      ) : saved && draft ? (
        <>
          {!saved.keyReady ? (
            <Alert variant="destructive">
              <AlertDescription>
                The API mail encryption key is missing or cannot decrypt saved
                credentials. Configure the server key before saving or sending
                emails.
              </AlertDescription>
            </Alert>
          ) : null}
          <PageSection>
            <TableContainer
              title="SMTP Configuration"
              description="Superadmin-only settings for all outgoing platform email."
            >
              <form
                onSubmit={(event) => void save(event)}
                className="space-y-5"
              >
                <fieldset disabled={busy} className="space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="mail-enabled">Enable outgoing email</Label>
                    <Switch
                      id="mail-enabled"
                      checked={draft.enabled}
                      onCheckedChange={(value) => update("enabled", value)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {saved.configured
                      ? "SMTP account configured."
                      : "No SMTP account configured."}{" "}
                    {saved.enabled
                      ? "Outgoing email is enabled."
                      : "Outgoing email is disabled."}
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="smtp-host">SMTP host</Label>
                      <Input
                        id="smtp-host"
                        required
                        maxLength={253}
                        value={draft.host}
                        placeholder="smtp.example.com"
                        onChange={(e) => update("host", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtp-port">Port</Label>
                      <Input
                        id="smtp-port"
                        required
                        type="number"
                        min={1}
                        max={65535}
                        value={draft.port}
                        onChange={(e) => update("port", Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtp-security">Security</Label>
                      <SelectMenu
                        id="smtp-security"
                        disabled={busy}
                        ariaLabel="SMTP security mode"
                        value={draft.security}
                        options={[
                          {
                            value: "STARTTLS",
                            label: "STARTTLS (usually port 587)",
                          },
                          { value: "TLS", label: "TLS (usually port 465)" },
                        ]}
                        onChange={(value) =>
                          update("security", value as "TLS" | "STARTTLS")
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtp-username">SMTP username</Label>
                      <Input
                        id="smtp-username"
                        autoComplete="off"
                        required
                        maxLength={320}
                        value={draft.username}
                        onChange={(e) => update("username", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtp-password">SMTP password</Label>
                      <Input
                        id="smtp-password"
                        type="password"
                        autoComplete="new-password"
                        required={!saved.hasPassword}
                        maxLength={1024}
                        value={password}
                        placeholder={
                          saved.hasPassword
                            ? "Leave blank to keep saved password"
                            : "Enter SMTP password"
                        }
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground">
                        {saved.hasPassword
                          ? "A password is saved and will never be displayed."
                          : "Use the SMTP password or app password supplied by your email provider."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mail-from-name">Sender name</Label>
                      <Input
                        id="mail-from-name"
                        required
                        maxLength={120}
                        value={draft.fromName}
                        onChange={(e) => update("fromName", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mail-from-email">Sender email</Label>
                      <Input
                        id="mail-from-email"
                        type="email"
                        required
                        maxLength={320}
                        value={draft.fromEmail}
                        onChange={(e) => update("fromEmail", e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="mail-reply-to">
                        Reply-to email (optional)
                      </Label>
                      <Input
                        id="mail-reply-to"
                        type="email"
                        maxLength={320}
                        value={draft.replyTo ?? ""}
                        onChange={(e) =>
                          update("replyTo", e.target.value || undefined)
                        }
                      />
                    </div>
                  </div>
                  <Button type="submit" disabled={!saved.keyReady || !dirty}>
                    {busy ? "Working…" : "Save configuration"}
                  </Button>
                </fieldset>
              </form>
            </TableContainer>
          </PageSection>
          <PageSection>
            <TableContainer
              title="Test Email"
              description="Test the saved account before using password recovery. A test can be sent while outgoing email is disabled."
            >
              <form
                onSubmit={(event) => void test(event)}
                className="space-y-4"
              >
                <Label htmlFor="test-recipient">Recipient email</Label>
                <Input
                  id="test-recipient"
                  type="email"
                  required
                  value={recipient}
                  disabled={busy}
                  onChange={(e) => setRecipient(e.target.value)}
                />
                {dirty ? (
                  <p className="text-sm text-muted-foreground">
                    Save your changes before testing.
                  </p>
                ) : null}
                <Button
                  type="submit"
                  variant="outline"
                  disabled={
                    busy || dirty || !saved.keyReady || !saved.configured
                  }
                >
                  Send test email
                </Button>
                {saved.lastTest ? (
                  <p className="text-sm text-muted-foreground">
                    Last test:{" "}
                    {saved.lastTest.status === "ACCEPTED"
                      ? "Accepted by SMTP server; check inbox/spam."
                      : `Failed (${saved.lastTest.code ?? "SMTP_DELIVERY_FAILED"}).`}{" "}
                    {new Date(saved.lastTest.at).toLocaleString()}
                  </p>
                ) : null}
              </form>
            </TableContainer>
          </PageSection>
        </>
      ) : null}
    </PageContainer>
  );
}
