/** UTC activation anniversaries; short months clamp without shifting later anniversaries. */
export function monthlyBillingPeriod(anchor: Date, at: Date) {
  if (
    !Number.isFinite(anchor.getTime()) ||
    !Number.isFinite(at.getTime()) ||
    at < anchor
  ) {
    throw new RangeError(
      "Billing timestamp must be on or after a valid activation anchor.",
    );
  }
  let months =
    (at.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
    at.getUTCMonth() -
    anchor.getUTCMonth();
  if (anniversary(anchor, months) > at) months--;
  return {
    start: anniversary(anchor, months),
    end: anniversary(anchor, months + 1),
  };
}

function anniversary(anchor: Date, months: number) {
  const date = new Date(anchor);
  date.setUTCDate(1);
  date.setUTCMonth(anchor.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(anchor.getUTCDate(), lastDay));
  return date;
}
