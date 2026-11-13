import { expect, it } from "vitest";
import { customerCodeEmail } from "./selfx-email-template.js";

it("labels deletion codes as destructive and directs them to the deletion page", () => {
  const html = customerCodeEmail("DELETE_ACCOUNT", "012345");
  expect(html).toContain("Confirm customer account deletion");
  expect(html).toContain("permanently closes your customer account");
  expect(html).toContain("Enter this code on the SelfX deletion page");
  expect(html).toContain("012345");
  expect(html).not.toContain("Enter this code in your SelfX app");
});
it("preserves ordinary mobile email-code instructions", () => {
  for (const purpose of [
    "EMAIL_LOGIN",
    "VERIFY_EMAIL",
    "RESET_PASSWORD",
  ] as const) {
    const html = customerCodeEmail(purpose, "012345");
    expect(html).toContain("Enter this code in your SelfX app");
    expect(html).not.toContain("Confirm customer account deletion");
  }
});
