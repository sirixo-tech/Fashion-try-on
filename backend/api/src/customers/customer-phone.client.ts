import { Injectable } from "@nestjs/common";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

export function verifiedPhoneClaims(claims: DecodedIdToken) {
  const now = Date.now() / 1000;
  if (
    !claims.uid ||
    claims.uid.length > 128 ||
    claims.firebase?.sign_in_provider !== "phone" ||
    !/^\+[1-9]\d{7,14}$/.test(claims.phone_number ?? "") ||
    !Number.isFinite(claims.auth_time) ||
    claims.auth_time < now - 300 ||
    claims.auth_time > now + 30
  )
    throw new Error("CUSTOMER_PHONE_INVALID");
  return { subject: claims.uid, phoneNumber: claims.phone_number! };
}

@Injectable()
export class CustomerPhoneClient {
  private configuration() {
    if (process.env.SELFX_CUSTOMER_PHONE_ENABLED !== "true") return null;
    if (
      process.env.NODE_ENV === "production" &&
      process.env.FIREBASE_AUTH_EMULATOR_HOST
    )
      return null;
    try {
      const projectId = process.env.SELFX_CUSTOMER_FIREBASE_PROJECT_ID;
      const account = JSON.parse(
        process.env.SELFX_CUSTOMER_FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}",
      );
      if (
        !projectId ||
        account.project_id !== projectId ||
        !account.client_email ||
        !account.private_key
      )
        return null;
      return { projectId, credential: cert(account) };
    } catch {
      return null;
    }
  }
  ready() {
    return this.configuration() !== null;
  }
  async verify(token: string) {
    const config = this.configuration();
    if (!config) throw new Error("CUSTOMER_PHONE_UNAVAILABLE");
    const appName = `selfx-customer-phone-${config.projectId}`;
    const app =
      getApps().find((value) => value.name === appName) ??
      initializeApp(config, appName);
    // Validate signature, issuer, project audience, expiry, disabled user and revocation.
    const claims = await getAuth(app).verifyIdToken(token, true);
    const verified = verifiedPhoneClaims(claims);
    return { ...verified, subject: `${config.projectId}:${verified.subject}` };
  }
}
