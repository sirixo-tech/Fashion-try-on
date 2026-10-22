"use client";
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
  Badge,
  Button,
  Input,
  Label,
  SelectMenu,
  TableContainer,
  Textarea,
} from "@selfx/ui";
import {
  getMailTemplates,
  saveMailTemplate,
  getMailHistory,
  sendCustomEmail,
  type MailTemplate,
  type MailDelivery,
} from "@/lib/mail-settings";
import { SafeApiError } from "@/lib/api";
import { RegionalDateTime } from "@/lib/regional-settings";
const errorText = (error: unknown) =>
  error instanceof SafeApiError
    ? error.message
    : "The request could not be completed. Try again.";
export function MailAutomationPanel({
  token,
  version,
  canSend,
}: {
  token: string;
  version: number;
  canSend: boolean;
}) {
  const [templates, setTemplates] = useState<MailTemplate[]>([]),
    [history, setHistory] = useState<MailDelivery[]>([]);
  const [code, setCode] = useState("STORE_CREATED"),
    [draft, setDraft] = useState({ subject: "", body: "" });
  const [custom, setCustom] = useState({
    recipient: "",
    subject: "",
    body: "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const sendKey = useRef<string | null>(null),
    sending = useRef(false);
  const latestToken = useRef(token);
  latestToken.current = token;
  const selected = templates.find((item) => item.code === code);
  const load = useCallback(async () => {
    try {
      const [next, recent] = await Promise.all([
        getMailTemplates(latestToken.current),
        getMailHistory(latestToken.current),
      ]);
      setTemplates(next);
      setHistory(recent);
      setDraft({ subject: next[0]?.subject ?? "", body: next[0]?.body ?? "" });
      setCode(next[0]?.code ?? "STORE_CREATED");
    } catch (e) {
      setError(errorText(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function choose(value: string) {
    if (
      selected &&
      (draft.subject !== selected.subject || draft.body !== selected.body) &&
      !window.confirm("Discard unsaved template changes?")
    )
      return;
    const next = templates.find((item) => item.code === value);
    if (next) {
      setCode(value);
      setDraft({ subject: next.subject, body: next.body });
      setNotice("");
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const next = await saveMailTemplate(latestToken.current, selected.code, {
        ...draft,
        version: selected.version,
      });
      setTemplates(next);
      const item = next.find((t) => t.code === selected.code)!;
      setDraft({ subject: item.subject, body: item.body });
      setNotice("Template saved. Future messages will use this version.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!canSend || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    sendKey.current ??= crypto.randomUUID();
    try {
      const result = await sendCustomEmail(latestToken.current, {
        ...custom,
        version,
        idempotencyKey: sendKey.current,
      });
      setNotice(result.message);
      setCustom({ recipient: "", subject: "", body: "" });
      sendKey.current = null;
      setHistory(await getMailHistory(latestToken.current));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }
  const preview = (value: string) =>
    value.replace(
      /{{\s*(\w+)\s*}}/g,
      (_, name: string) => selected?.previewValues[name] ?? "",
    );
  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && <p role="status">{notice}</p>}
      <TableContainer
        title="Email Templates"
        description="Default messages for Store events and verified purchases. Edits apply to future emails."
      >
        <form onSubmit={(event) => void save(event)} className="space-y-4">
          <Label htmlFor="mail-template">Template context</Label>
          <SelectMenu
            id="mail-template"
            ariaLabel="Template context"
            value={code}
            disabled={busy}
            options={templates.map((item) => ({
              value: item.code,
              label: `${item.group} — ${item.name}`,
            }))}
            onChange={choose}
          />
          <Label htmlFor="template-subject">Template subject</Label>
          <Input
            id="template-subject"
            required
            maxLength={240}
            disabled={busy}
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
          <Label htmlFor="template-body">Template body</Label>
          <Textarea
            id="template-body"
            required
            maxLength={20000}
            rows={8}
            disabled={busy}
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <div
            className="flex flex-wrap gap-2"
            aria-label="Available variables"
          >
            {selected?.variables.map((variable) => (
              <Badge
                key={variable}
                variant="outline"
              >{`{{${variable}}}`}</Badge>
            ))}
            {selected?.variables.length === 0 && (
              <p>No variables for this reusable draft.</p>
            )}
          </div>
          <div className="space-y-2 rounded-lg border p-4">
            <h3 className="font-medium">Preview (sample values)</h3>
            <p>{preview(draft.subject)}</p>
            <p className="whitespace-pre-wrap text-sm">{preview(draft.body)}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              type="submit"
              disabled={
                busy ||
                !selected ||
                (draft.subject === selected.subject &&
                  draft.body === selected.body)
              }
            >
              Save template
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !selected}
              onClick={() =>
                selected &&
                setDraft({
                  subject: selected.defaultSubject,
                  body: selected.defaultBody,
                })
              }
            >
              Restore default
            </Button>
          </div>
        </form>
      </TableContainer>
      <TableContainer
        title="Send Custom Email"
        description="Send a one-time message using the saved outgoing mail configuration."
      >
        <form onSubmit={(event) => void send(event)} className="space-y-4">
          <SelectMenu
            ariaLabel="Use saved custom template"
            value=""
            disabled={busy}
            options={[
              { value: "", label: "Use saved custom template…" },
              ...templates
                .filter((item) => item.group === "Custom mails")
                .map((item) => ({ value: item.code, label: item.name })),
            ]}
            onChange={(value) => {
              const item = templates.find((t) => t.code === value);
              if (item) {
                setCustom({
                  ...custom,
                  subject: item.subject,
                  body: item.body,
                });
                sendKey.current = null;
              }
            }}
          />
          <Label htmlFor="custom-recipient">Recipient email</Label>
          <Input
            id="custom-recipient"
            type="email"
            required
            maxLength={320}
            disabled={busy}
            value={custom.recipient}
            onChange={(e) => {
              setCustom({ ...custom, recipient: e.target.value });
              sendKey.current = null;
            }}
          />
          <Label htmlFor="custom-subject">Subject</Label>
          <Input
            id="custom-subject"
            required
            maxLength={240}
            disabled={busy}
            value={custom.subject}
            onChange={(e) => {
              setCustom({ ...custom, subject: e.target.value });
              sendKey.current = null;
            }}
          />
          <Label htmlFor="custom-body">Message</Label>
          <Textarea
            id="custom-body"
            required
            rows={6}
            maxLength={20000}
            disabled={busy}
            value={custom.body}
            onChange={(e) => {
              setCustom({ ...custom, body: e.target.value });
              sendKey.current = null;
            }}
          />
          {!canSend && (
            <p>
              Enable and save outgoing email before sending a custom message.
            </p>
          )}
          <Button type="submit" disabled={busy || !canSend}>
            Send custom email
          </Button>
        </form>
      </TableContainer>
      <TableContainer
        title="Delivery History"
        description="Latest 50 messages, retained for seven days after completion. SMTP acceptance does not guarantee inbox delivery."
      >
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            try {
              setHistory(await getMailHistory(latestToken.current));
            } catch (e) {
              setError(errorText(e));
            }
          }}
        >
          Refresh delivery history
        </Button>
        {history.length ? (
          <div className="mt-4 space-y-3">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm"
              >
                <span>
                  {templates.find((t) => t.code === item.templateCode)?.name ??
                    item.templateCode}
                </span>
                <span>{item.recipientMask}</span>
                <Badge variant="outline">
                  {item.status === "SENT" ? "Accepted by SMTP" : item.status}
                </Badge>
                <span>{item.attempts} attempts</span>
                {item.failureCode && <span>{item.failureCode}</span>}
                <RegionalDateTime value={item.createdAt} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm">No recent mail deliveries.</p>
        )}
      </TableContainer>
    </div>
  );
}
