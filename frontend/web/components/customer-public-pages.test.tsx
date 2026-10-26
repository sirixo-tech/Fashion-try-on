import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import TermsPage from "@/app/terms/page";
import PrivacyPage from "@/app/privacy/page";
import SupportPage from "@/app/support/page";
import { PublicLegalLinks } from "./public-legal-links";
afterEach(cleanup);
it("provides policy routes and clear mobile retention and sponsorship terms", () => {
  render(<TermsPage />);
  expect(screen.getByRole("heading", { name: "Terms of Use" })).toBeTruthy();
  expect(screen.getByText(/within 30 days of creation/)).toBeTruthy();
  expect(
    screen.getByText(/Personal credits are not silently used/),
  ).toBeTruthy();
});
it("explains optional notifications and the mobile photo retention exception", () => {
  render(<PrivacyPage />);
  expect(screen.getByText(/30 days/)).toBeTruthy();
  expect(screen.getByRole("heading", { name: /notifications/i })).toBeTruthy();
});
it("uses the established support contact", () => {
  render(<SupportPage />);
  expect(
    screen
      .getAllByRole("link", { name: "sirixollc@gmail.com" })[0]!
      .getAttribute("href"),
  ).toMatch(/^mailto:/);
});
it("links Terms alongside Privacy and Support", () => {
  render(<PublicLegalLinks />);
  expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe(
    "/terms",
  );
  expect(
    screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href"),
  ).toBe("/privacy");
});
