import { selfxApi } from "@/lib/api";
export interface MailSettings {
  version: number;
  enabled: boolean;
  host: string;
  port: number;
  security: "TLS" | "STARTTLS";
  username: string;
  fromEmail: string;
  fromName: string;
  replyTo: string;
  hasPassword: boolean;
  keyReady: boolean;
  configured: boolean;
  lastTest: { status: "ACCEPTED" | "FAILED"; at: string; code?: string } | null;
}
export type MailSettingsInput = Pick<
  MailSettings,
  | "version"
  | "enabled"
  | "host"
  | "port"
  | "security"
  | "username"
  | "fromEmail"
  | "fromName"
> & { password?: string; replyTo?: string; editConfirmed?: boolean };
const path = "/api/v1/admin/platform-settings/mail";
export function getMailSettings(accessToken: string) {
  return selfxApi<MailSettings>(path, { accessToken });
}
export function saveMailSettings(
  accessToken: string,
  input: MailSettingsInput,
) {
  return selfxApi<MailSettings>(path, {
    accessToken,
    method: "PUT",
    body: JSON.stringify(input),
  });
}
export interface MailTemplate {
  code: string;
  name: string;
  group: string;
  version: number;
  subject: string;
  body: string;
  variables: string[];
  defaultSubject: string;
  defaultBody: string;
  previewValues: Record<string, string>;
  preview: { subject: string; text: string };
}
export interface MailDelivery {
  id: string;
  templateCode: string;
  recipientMask: string | null;
  status: string;
  attempts: number;
  failureCode: string | null;
  createdAt: string;
  updatedAt: string;
}
export const getMailTemplates = (accessToken: string) =>
  selfxApi<MailTemplate[]>(`${path}/templates`, {
    accessToken,
    cache: "no-store",
  });
export const saveMailTemplate = (
  accessToken: string,
  code: string,
  input: { version: number; subject: string; body: string },
) =>
  selfxApi<MailTemplate[]>(`${path}/templates/${encodeURIComponent(code)}`, {
    accessToken,
    method: "PUT",
    body: JSON.stringify(input),
  });
export const getMailHistory = (accessToken: string) =>
  selfxApi<MailDelivery[]>(`${path}/history`, {
    accessToken,
    cache: "no-store",
  });
export const sendCustomEmail = (
  accessToken: string,
  input: {
    version: number;
    recipient: string;
    subject: string;
    body: string;
    idempotencyKey: string;
  },
) =>
  selfxApi<{ queued: boolean; id: string; message: string }>(`${path}/custom`, {
    accessToken,
    method: "POST",
    body: JSON.stringify(input),
  });
