# PAYMENTS-1J — Aligned gateway headers and compact status

Date: 19 October 2026

Provider logos stay on the left. Names, descriptions and compact mode/status
badges are grouped on the right. Mobile cards use a narrower logo container so
the text and badges can wrap. Planned cards no longer render an empty body.

Configured supported gateways show their saved Live mode, Test mode or Mode
unconfirmed environment. Status is Off when disabled or unselected, otherwise
Verified or Needs verification. Missing configuration shows Needs setup;
unsupported providers show Planned only. Current account verification never
claims Ready for checkout because customer checkout remains unavailable.

Existing selection, Edit/Delete, setup dialogs and separate verification/history
remain unchanged. No API, database or environment changes are required.

Validation: 14 payment-settings tests passed, including saved environments,
verification, unselected/disabled gateways and truthful checkout status. Web
TypeScript, changed-file ESLint and Git whitespace checks passed.

Desktop/mobile visual verification uses the isolated dummy-data preview from
PAYMENTS-1I. No real account, provider request or deployment is involved.
