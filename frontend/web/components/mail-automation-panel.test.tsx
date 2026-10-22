import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MailAutomationPanel } from "./mail-automation-panel";
import {
  getMailTemplates,
  getMailHistory,
  saveMailTemplate,
  sendCustomEmail,
  type MailTemplate,
} from "@/lib/mail-settings";
vi.mock("@/lib/mail-settings", () => ({
  getMailTemplates: vi.fn(),
  getMailHistory: vi.fn(),
  saveMailTemplate: vi.fn(),
  sendCustomEmail: vi.fn(),
}));
const template: MailTemplate = {
  code: "STORE_CREATED",
  name: "Store created",
  group: "Stores",
  version: 1,
  subject: "Welcome {{storeName}}",
  body: "Hello {{storeName}}",
  defaultSubject: "Default {{storeName}}",
  defaultBody: "Default body {{storeName}}",
  variables: ["storeName"],
  previewValues: { storeName: "Example Store" },
  preview: { subject: "Welcome Example Store", text: "Hello Example Store" },
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMailTemplates).mockResolvedValue([template]);
  vi.mocked(getMailHistory).mockResolvedValue([]);
});
afterEach(cleanup);
it("previews variable substitution, saves a versioned template and restores defaults as a draft", async () => {
  vi.mocked(saveMailTemplate).mockResolvedValue([
    { ...template, version: 2, subject: "Changed {{storeName}}" },
  ]);
  render(<MailAutomationPanel token="token" version={4} canSend />);
  await screen.findByText("Welcome Example Store");
  fireEvent.change(screen.getByLabelText("Template subject"), {
    target: { value: "Changed {{storeName}}" },
  });
  expect(screen.getByText("Changed Example Store")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save template" }));
  await waitFor(() =>
    expect(saveMailTemplate).toHaveBeenCalledWith("token", "STORE_CREATED", {
      version: 1,
      subject: "Changed {{storeName}}",
      body: template.body,
    }),
  );
  await screen.findByText(/Future messages/);
  fireEvent.click(screen.getByRole("button", { name: "Restore default" }));
  expect(
    (screen.getByLabelText("Template subject") as HTMLInputElement).value,
  ).toBe(template.defaultSubject);
  expect(saveMailTemplate).toHaveBeenCalledTimes(1);
});
it("preserves a failed custom draft and reuses its idempotency key on retry", async () => {
  vi.mocked(sendCustomEmail)
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValueOnce({ queued: true, id: "job", message: "Queued" });
  render(<MailAutomationPanel token="token" version={4} canSend />);
  await screen.findByText("Welcome Example Store");
  fireEvent.change(screen.getByLabelText("Recipient email"), {
    target: { value: "recipient@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Subject"), {
    target: { value: "Hello" },
  });
  fireEvent.change(screen.getByLabelText("Message"), {
    target: { value: "Keep this draft" },
  });
  const submit = screen
    .getByRole("button", { name: "Send custom email" })
    .closest("form")!;
  fireEvent.submit(submit);
  await screen.findByText(/request could not/);
  expect((screen.getByLabelText("Message") as HTMLInputElement).value).toBe(
    "Keep this draft",
  );
  fireEvent.submit(submit);
  await screen.findByText("Queued");
  expect(vi.mocked(sendCustomEmail).mock.calls[0]![1].idempotencyKey).toBe(
    vi.mocked(sendCustomEmail).mock.calls[1]![1].idempotencyKey,
  );
});
it("keeps template drafts through access-token refresh and uses the latest token", async () => {
  vi.mocked(saveMailTemplate).mockResolvedValue([{ ...template, version: 2 }]);
  const view = render(<MailAutomationPanel token="old" version={4} canSend />);
  await screen.findByText("Welcome Example Store");
  fireEvent.change(screen.getByLabelText("Template body"), {
    target: { value: "Unsaved text" },
  });
  view.rerender(<MailAutomationPanel token="new" version={4} canSend />);
  expect(
    (screen.getByLabelText("Template body") as HTMLInputElement).value,
  ).toBe("Unsaved text");
  fireEvent.click(screen.getByRole("button", { name: "Save template" }));
  await waitFor(() =>
    expect(saveMailTemplate).toHaveBeenCalledWith(
      "new",
      "STORE_CREATED",
      expect.objectContaining({ body: "Unsaved text" }),
    ),
  );
  expect(getMailTemplates).toHaveBeenCalledTimes(1);
});
