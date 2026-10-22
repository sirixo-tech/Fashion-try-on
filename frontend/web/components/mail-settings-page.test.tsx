import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MailSettingsPage } from "./mail-settings-page";
import {
  getMailSettings,
  saveMailSettings,
  sendCustomEmail,
  getMailTemplates,
  getMailHistory,
  type MailSettings,
} from "@/lib/mail-settings";
import { SafeApiError } from "@/lib/api";
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "fixture-token" }),
}));
vi.mock("@/lib/mail-settings", () => ({
  getMailSettings: vi.fn(),
  saveMailSettings: vi.fn(),
  sendCustomEmail: vi.fn(),
  getMailTemplates: vi.fn(),
  getMailHistory: vi.fn(),
  saveMailTemplate: vi.fn(),
}));
const initial: MailSettings = {
  version: 1,
  enabled: true,
  host: "smtp.example.com",
  port: 587,
  security: "STARTTLS",
  username: "user",
  fromEmail: "mail@example.com",
  fromName: "SelfX",
  replyTo: "",
  hasPassword: true,
  keyReady: true,
  configured: true,
  lastTest: null,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getMailSettings).mockResolvedValue(initial);
  vi.mocked(getMailTemplates).mockResolvedValue([]);
  vi.mocked(getMailHistory).mockResolvedValue([]);
});
async function unlock() {
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit configuration" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Proceed" }));
}
afterEach(cleanup);
it("keeps saved passwords blank and omits them when saving other changes", async () => {
  vi.mocked(saveMailSettings).mockResolvedValue({
    ...initial,
    version: 2,
    fromName: "New sender",
  });
  render(<MailSettingsPage />);
  expect(
    ((await screen.findByLabelText("SMTP password")) as HTMLInputElement).value,
  ).toBe("");
  expect(
    (screen.getByLabelText("SMTP password") as HTMLInputElement).placeholder,
  ).toBe("••••••••");
  expect(
    (
      screen.getByRole("button", {
        name: "Show SMTP password",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (screen.getByLabelText("Sender name") as HTMLInputElement).matches(
      ":disabled",
    ),
  ).toBe(true);
  await unlock();
  fireEvent.change(screen.getByLabelText("Sender name"), {
    target: { value: "New sender" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Send custom email",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.submit(
    screen.getByRole("button", { name: "Save configuration" }).closest("form")!,
  );
  await screen.findByText(/Mail settings saved/);
  const input = vi.mocked(saveMailSettings).mock.calls[0]![1];
  expect(input.fromName).toBe("New sender");
  expect(input).not.toHaveProperty("password");
  expect(input.editConfirmed).toBe(true);
  expect(
    (screen.getByLabelText("Sender name") as HTMLInputElement).matches(
      ":disabled",
    ),
  ).toBe(true);
});
it("clears a newly entered SMTP password even when saving fails", async () => {
  vi.mocked(saveMailSettings).mockRejectedValue(
    new SafeApiError("MAIL_SETTINGS_CONFLICT", "Refresh before saving."),
  );
  render(<MailSettingsPage />);
  await unlock();
  fireEvent.change(await screen.findByLabelText("SMTP password"), {
    target: { value: "private-new-password" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Save configuration" }).closest("form")!,
  );
  await screen.findByText("Refresh before saving.");
  expect(
    (screen.getByLabelText("SMTP password") as HTMLInputElement).value,
  ).toBe("");
});
it("queues a custom email using saved settings and removes the test-mail interface", async () => {
  vi.mocked(sendCustomEmail).mockResolvedValue({
    queued: true,
    id: "job",
    message: "Email queued. Check delivery history.",
  });
  render(<MailSettingsPage />);
  fireEvent.change(await screen.findByLabelText("Recipient email"), {
    target: { value: "recipient@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Subject"), {
    target: { value: "Hello" },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Custom message" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Send custom email" }).closest("form")!,
  );
  expect(
    await screen.findByText("Email queued. Check delivery history."),
  ).toBeTruthy();
  expect(sendCustomEmail).toHaveBeenCalledWith("fixture-token", {
    recipient: "recipient@example.com",
    version: 1,
    subject: "Hello",
    body: "Custom message",
    idempotencyKey: expect.any(String),
  });
  expect(screen.queryByRole("button", { name: "Send test email" })).toBeNull();
});

it("cancel discards SMTP drafts and locks the settings again", async () => {
  render(<MailSettingsPage />);
  await unlock();
  fireEvent.change(screen.getByLabelText("Sender name"), {
    target: { value: "Changed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cancel changes" }));
  expect((screen.getByLabelText("Sender name") as HTMLInputElement).value).toBe(
    "SelfX",
  );
  expect(
    (screen.getByLabelText("Sender name") as HTMLInputElement).matches(
      ":disabled",
    ),
  ).toBe(true);
  expect(saveMailSettings).not.toHaveBeenCalled();
});
it("does not render credential inputs when server authorization denies access", async () => {
  vi.mocked(getMailSettings).mockRejectedValue(
    new SafeApiError(
      "PLATFORM_PERMISSION_DENIED",
      "Only Superadmins can access Mail Settings.",
    ),
  );
  render(<MailSettingsPage />);
  await waitFor(() =>
    expect(
      screen.getByText("Only Superadmins can access Mail Settings."),
    ).toBeTruthy(),
  );
  expect(screen.queryByLabelText("SMTP password")).toBeNull();
});
