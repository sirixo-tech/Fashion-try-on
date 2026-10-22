"use client";
import { MailAutomationPanel } from "./mail-automation-panel";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Input,
  SecretInput,
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
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const [saved, setSaved] = useState<MailSettings | null>(null);
  const [draft, setDraft] = useState<MailSettingsInput | null>(null);
  const [password, setPassword] = useState("");
  const [editing, setEditing] = useState(false),
    [confirmEdit, setConfirmEdit] = useState(false);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    if (!tokenRef.current) return;
    setLoading(true);
    setError("");
    setNotice("");
    setPassword("");
    setEditing(false);
    try {
      const value = await getMailSettings(tokenRef.current);
      setSaved(value);
      setDraft(draftFor(value));
    } catch (e) {
      setSaved(null);
      setDraft(null);
      setError(messageFor(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, session.status]);
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
    if (!draft || !token || !editing) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const value = await saveMailSettings(token, {
        ...draft,
        editConfirmed: true,
        ...(password ? { password } : {}),
        ...(draft.replyTo ? {} : { replyTo: undefined }),
      });
      setSaved(value);
      setDraft(draftFor(value));
      setEditing(false);
      setNotice("Mail settings saved and locked.");
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setPassword("");
      setBusy(false);
    }
  }
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Platform Settings"
        title="Mail Settings"
        description="Manage outgoing email, automatic templates and custom messages."
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
              description="Locked by default. Changes affect every outgoing SelfX email."
            >
              {!editing && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirmEdit(true)}
                >
                  Edit configuration
                </Button>
              )}
              <Dialog open={confirmEdit} onOpenChange={setConfirmEdit}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit SMTP configuration?</DialogTitle>
                    <DialogDescription>
                      Changing these settings can interrupt account emails,
                      purchase receipts and Store notifications. Confirm the
                      host, credentials, sender and security mode before saving.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => setConfirmEdit(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setConfirmEdit(false);
                        setEditing(true);
                      }}
                    >
                      Proceed
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              <form
                onSubmit={(event) => void save(event)}
                className="space-y-5"
              >
                <fieldset disabled={busy || !editing} className="space-y-5">
                  <div className="flex items-center justify-between gap-4">
                    <Label htmlFor="mail-enabled">Enable outgoing email</Label>
                    <Switch
                      id="mail-enabled"
                      checked={draft.enabled}
                      disabled={busy || !editing}
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
                        disabled={busy || !editing}
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
                      <SecretInput
                        id="smtp-password"
                        saved={saved.hasPassword}
                        revealable
                        visibilityLabel="SMTP password"
                        aria-describedby="smtp-password-hint"
                        autoComplete="new-password"
                        required={!saved.hasPassword}
                        maxLength={1024}
                        value={password}
                        placeholder="Enter SMTP password"
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <p
                        id="smtp-password-hint"
                        className="text-sm text-muted-foreground"
                      >
                        {saved.hasPassword
                          ? "Password saved. Enter a new password to replace it. Only newly entered text can be shown."
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
                  {editing && (
                    <Button type="submit" disabled={!saved.keyReady || !dirty}>
                      {busy ? "Working…" : "Save configuration"}
                    </Button>
                  )}
                </fieldset>
                {editing && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setDraft(draftFor(saved));
                      setPassword("");
                      setEditing(false);
                    }}
                  >
                    Cancel changes
                  </Button>
                )}
              </form>
            </TableContainer>
          </PageSection>
          {token && (
            <PageSection>
              <MailAutomationPanel
                token={token}
                version={saved.version}
                canSend={
                  !editing &&
                  !busy &&
                  saved.enabled &&
                  saved.configured &&
                  saved.keyReady
                }
              />
            </PageSection>
          )}
        </>
      ) : null}
    </PageContainer>
  );
}
