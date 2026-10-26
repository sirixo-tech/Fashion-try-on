import { Injectable } from "@nestjs/common";
import { GoogleAuth } from "google-auth-library";
import { customerNotificationCopy } from "./customer-notification-copy.js";

@Injectable()
export class CustomerPushSender {
  private auth?: GoogleAuth;
  configuration() {
    const projectId = process.env.SELFX_CUSTOMER_FCM_PROJECT_ID ?? "";
    try {
      const credentials = JSON.parse(
        process.env.SELFX_CUSTOMER_FCM_SERVICE_ACCOUNT_JSON ?? "{}",
      ) as Record<string, string>;
      if (
        !/^[a-z][a-z0-9-]{5,62}$/.test(projectId) ||
        credentials.project_id !== projectId ||
        !credentials.client_email ||
        !credentials.private_key
      )
        return null;
      return { projectId, credentials };
    } catch {
      return null;
    }
  }
  async send(
    token: string,
    event: { id: string; runId: string; expiresAt: Date; language?: string },
  ): Promise<"SENT" | "UNREGISTERED" | "RETRY" | "FAILED"> {
    const config = this.configuration();
    if (!config) return "RETRY";
    try {
      this.auth ??= new GoogleAuth({
        credentials: config.credentials,
        scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
      });
      const accessToken = await this.auth.getAccessToken();
      const ttl = Math.max(
        0,
        Math.min(
          86400,
          Math.floor((event.expiresAt.getTime() - Date.now()) / 1000),
        ),
      );
      if (!ttl) return "FAILED";
      const copy = customerNotificationCopy(event.language);
      const response = await fetch(
        `https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`,
        {
          method: "POST",
          signal: AbortSignal.timeout(10000),
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message: {
              fid: token,
              notification: {
                title: copy.title,
                body: copy.pushBody,
              },
              data: {
                notificationId: event.id,
                runId: event.runId,
                kind: "TRY_ON_READY",
              },
              android: {
                ttl: `${ttl}s`,
                notification: { tag: event.id, channel_id: "selfx_updates" },
              },
              apns: {
                headers: {
                  "apns-collapse-id": event.id,
                  "apns-expiration": String(
                    Math.floor(Date.now() / 1000) + ttl,
                  ),
                },
              },
            },
          }),
        },
      );
      if (response.ok) return "SENT";
      const error = (await response.json().catch(() => ({}))) as {
        error?: { details?: Array<{ errorCode?: string }> };
      };
      if (
        error.error?.details?.some(
          (detail) => detail.errorCode === "UNREGISTERED",
        )
      )
        return "UNREGISTERED";
      return response.status === 429 ||
        response.status >= 500 ||
        response.status === 401 ||
        response.status === 403
        ? "RETRY"
        : "FAILED";
    } catch {
      return "RETRY";
    }
  }
}
