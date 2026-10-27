import { afterEach, describe, expect, it, vi } from "vitest";
import type { DecodedIdToken } from "firebase-admin/auth";
import {
  CustomerPhoneClient,
  verifiedPhoneClaims,
} from "./customer-phone.client.js";

const mocks = vi.hoisted(() => ({ verify: vi.fn(), initialize: vi.fn() }));
vi.mock("firebase-admin/app", () => ({
  cert: () => ({}),
  getApps: () => [],
  initializeApp: mocks.initialize,
}));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ verifyIdToken: mocks.verify }),
}));
const claims = () =>
  ({
    uid: "phone-subject",
    phone_number: "+919876543210",
    auth_time: Math.floor(Date.now() / 1000),
    firebase: { sign_in_provider: "phone", identities: {} },
  }) as DecodedIdToken;
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("Firebase phone proof boundary", () => {
  it("requires a current phone authentication and canonical verified number", () => {
    expect(verifiedPhoneClaims(claims())).toEqual({
      subject: "phone-subject",
      phoneNumber: "+919876543210",
    });
    for (const change of [
      { auth_time: 1 },
      { auth_time: Math.floor(Date.now() / 1000) + 100 },
      { phone_number: "9876543210" },
      { uid: "" },
      { firebase: { sign_in_provider: "custom", identities: {} } },
    ])
      expect(() => verifiedPhoneClaims({ ...claims(), ...change })).toThrow();
  });
  it("fails closed without explicit project credentials and forbids production emulator verification", () => {
    vi.stubEnv("SELFX_CUSTOMER_PHONE_ENABLED", "false");
    expect(new CustomerPhoneClient().ready()).toBe(false);
    vi.stubEnv("SELFX_CUSTOMER_PHONE_ENABLED", "true");
    vi.stubEnv("SELFX_CUSTOMER_FIREBASE_PROJECT_ID", "selfx-test");
    vi.stubEnv("SELFX_CUSTOMER_FIREBASE_SERVICE_ACCOUNT_JSON", "{}");
    expect(new CustomerPhoneClient().ready()).toBe(false);
    vi.stubEnv(
      "SELFX_CUSTOMER_FIREBASE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({
        project_id: "selfx-test",
        client_email: "test@example.invalid",
        private_key: "synthetic",
      }),
    );
    expect(new CustomerPhoneClient().ready()).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "localhost:9099");
    expect(new CustomerPhoneClient().ready()).toBe(false);
    expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("delegates signature/project/expiry and revoked-user checks to the Admin SDK", async () => {
    vi.stubEnv("SELFX_CUSTOMER_PHONE_ENABLED", "true");
    vi.stubEnv("SELFX_CUSTOMER_FIREBASE_PROJECT_ID", "selfx-test");
    vi.stubEnv(
      "SELFX_CUSTOMER_FIREBASE_SERVICE_ACCOUNT_JSON",
      JSON.stringify({
        project_id: "selfx-test",
        client_email: "test@example.invalid",
        private_key: "synthetic",
      }),
    );
    mocks.verify.mockResolvedValueOnce(claims());
    await expect(
      new CustomerPhoneClient().verify("synthetic-id-token"),
    ).resolves.toHaveProperty("phoneNumber", "+919876543210");
    expect(mocks.verify).toHaveBeenCalledWith("synthetic-id-token", true);
    mocks.verify.mockRejectedValueOnce(new Error("revoked or invalid"));
    await expect(
      new CustomerPhoneClient().verify("bad-token"),
    ).rejects.toThrow();
  });
});
