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
  sendTestEmail,
  type MailSettings,
} from "@/lib/mail-settings";
import { SafeApiError } from "@/lib/api";
vi.mock("@/lib/session", () => ({
  useSession: () => ({ status: "authenticated", accessToken: "fixture-token" }),
}));
vi.mock("@/lib/mail-settings", () => ({
  getMailSettings: vi.fn(),
  saveMailSettings: vi.fn(),
  sendTestEmail: vi.fn(),
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
});
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
  fireEvent.change(screen.getByLabelText("Sender name"), {
    target: { value: "New sender" },
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Send test email",
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
});
it("clears a newly entered SMTP password even when saving fails", async () => {
  vi.mocked(saveMailSettings).mockRejectedValue(
    new SafeApiError("MAIL_SETTINGS_CONFLICT", "Refresh before saving."),
  );
  render(<MailSettingsPage />);
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
it("tests only the saved configuration and explains SMTP acceptance", async () => {
  vi.mocked(sendTestEmail).mockResolvedValue({
    accepted: true,
    message: "SMTP accepted the test email. Check inbox and spam.",
  });
  render(<MailSettingsPage />);
  fireEvent.change(await screen.findByLabelText("Recipient email"), {
    target: { value: "recipient@example.com" },
  });
  fireEvent.submit(
    screen.getByRole("button", { name: "Send test email" }).closest("form")!,
  );
  expect(
    await screen.findByText(
      "SMTP accepted the test email. Check inbox and spam.",
    ),
  ).toBeTruthy();
  expect(sendTestEmail).toHaveBeenCalledWith(
    "fixture-token",
    "recipient@example.com",
    1,
  );
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
