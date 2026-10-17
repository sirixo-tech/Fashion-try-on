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
> & { password?: string; replyTo?: string };
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
export function sendTestEmail(
  accessToken: string,
  recipient: string,
  version: number,
) {
  return selfxApi<{ accepted: boolean; message: string }>(`${path}/test`, {
    accessToken,
    method: "POST",
    body: JSON.stringify({ recipient, version }),
  });
}
