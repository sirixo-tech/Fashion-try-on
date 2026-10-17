import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  PostpaidBillingSummary,
  postpaidMoney,
} from "./postpaid-billing-summary";

afterEach(cleanup);
describe("postpaid usage summary", () => {
  it("shows billable usage, imported history, an estimate and UTC boundaries", () => {
    render(
      <PostpaidBillingSummary
        summary={{
          billingMode: "POSTPAID_PAYG",
          timezone: "UTC",
          periodStart: "2026-09-16T18:30:00Z",
          periodEnd: "2026-10-16T18:30:00Z",
          currency: "INR",
          creditUnitPriceCents: 125,
          billableCredits: 12,
          historicalCredits: 3,
          estimatedAmountCents: "1500",
        }}
      />,
    );
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("3 credits")).toBeTruthy();
    expect(screen.getByText("INR 15.00")).toBeTruthy();
    expect(screen.getByText("INR 1.25")).toBeTruthy();
    expect(screen.getByText(/UTC$/)).toBeTruthy();
    expect(
      screen.getByText(/No advance purchase or credit limit/),
    ).toBeTruthy();
    expect(screen.queryByText(/Credits remaining/)).toBeNull();
  });
  it("formats amounts beyond JavaScript's safe integer range without losing minor units", () => {
    expect(postpaidMoney("900719925474099301", "INR").endsWith(".01")).toBe(
      true,
    );
  });
});
