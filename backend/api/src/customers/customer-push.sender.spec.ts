import { afterEach, expect, it, vi } from "vitest";
import { GoogleAuth } from "google-auth-library";
import { CustomerPushSender } from "./customer-push.sender.js";
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function configured() {
  vi.stubEnv("SELFX_CUSTOMER_FCM_PROJECT_ID", "selfx-test-project");
  vi.stubEnv(
    "SELFX_CUSTOMER_FCM_SERVICE_ACCOUNT_JSON",
    JSON.stringify({
      project_id: "selfx-test-project",
      client_email: "fake@example.invalid",
      private_key: "synthetic-unused-key",
    }),
  );
  vi.spyOn(GoogleAuth.prototype, "getAccessToken").mockResolvedValue(
    "synthetic-access",
  );
  return new CustomerPushSender();
}
const event = () => ({
  id: "notification-id",
  runId: "run-id",
  expiresAt: new Date(Date.now() + 86400000),
});
it("does not call Firebase without server configuration", async () => {
  vi.stubEnv("SELFX_CUSTOMER_FCM_PROJECT_ID", "");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await new CustomerPushSender().send("synthetic-fid", event())).toBe(
    "RETRY",
  );
  expect(fetcher).not.toHaveBeenCalled();
});
it("sends a generic FID-targeted payload with expiry and no image URLs", async () => {
  const service = configured();
  const fetcher = vi
    .fn()
    .mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetcher);
  expect(await service.send("synthetic-fid", event())).toBe("SENT");
  const [url, options] = fetcher.mock.calls[0]!;
  expect(url).toBe(
    "https://fcm.googleapis.com/v1/projects/selfx-test-project/messages:send",
  );
  const payload = JSON.parse(options.body).message;
  expect(payload.fid).toBe("synthetic-fid");
  expect(payload.data).toEqual({
    notificationId: "notification-id",
    runId: "run-id",
    kind: "TRY_ON_READY",
  });
  expect(payload.android.notification.channel_id).toBe("selfx_updates");
  expect(options.body).not.toContain("image");
});
for (const [status, body, expected] of [
  [
    404,
    { error: { details: [{ errorCode: "UNREGISTERED" }] } },
    "UNREGISTERED",
  ],
  [429, {}, "RETRY"],
  [503, {}, "RETRY"],
  [400, {}, "FAILED"],
] as const) {
  it(`classifies Firebase ${status} without exposing provider details`, async () => {
    const service = configured();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
    );
    expect(await service.send("synthetic-fid", event())).toBe(expected);
  });
}
