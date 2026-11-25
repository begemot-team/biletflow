# Mirat — Phase 6: platform operations and stabilization

Implementation date: November 25, 2026.
Branch: `feature/mirat-phase6`, based on the updated `dev` branch.

## Contribution this period

- Expanded the Platform Admin portal from the Phase 4 moderation shell into an
  operations workspace backed by the current BiletFlow API.
- Replaced the support-case approximation of paid-sales activation with the real
  Platform Admin activation records. The page now shows the event, organizer,
  activation state and simulated fee and lets an administrator suspend or restore
  paid sales with a recorded reason.
- Added event-complaint and platform-escalation inboxes using the existing support
  records. Administrators can filter cases that need attention and move them through
  In Progress, Waiting for Customer and Resolved states.
- Added platform-wide promotional-campaign activity by combining the administrator's
  event access with the campaign reports already calculated by the backend. It shows
  redemptions, ticket count, discount, refunds and net campaign revenue.
- Added downloadable UTF-8 CSV operational reports for events, support cases and
  promotional campaigns. CSV values are escaped safely and financial values are
  exported in exact integer minor units.
- Added the missing support-case `category` filter used by the admin views.
- Added an RFC 5545 cancellation `.ics` attachment to event-cancellation email. It
  uses the stable `event-{id}@biletflow` UID, `METHOD:CANCEL` and `STATUS:CANCELLED`,
  so an attendee's earlier calendar entry can be updated without calendar-account
  write access.

## Verification

- `npm test`: 62 frontend tests passed.
- `npm run lint`: passed.
- `npm run build`: production build passed.
- Python `ruff` checks and source compilation: passed.
- 161 non-concurrency backend tests passed in an isolated SQLite test environment,
  including 15 focused support and cancellation-calendar tests.
- `git diff --check`: passed.
- The five existing concurrency tests require PostgreSQL row-locking semantics and
  cannot run on SQLite. They remain for the PostgreSQL GitHub Actions run; the local
  Docker.app installation could not start because its executable is missing.

## Remaining backend dependency

The current data model has successful payments and refunds, but has no Platform Admin
list/search endpoints for orders or payments and does not retain payment-failure or
dispute records. It also exposes activation fees from deployment configuration as
read-only state. Therefore the UI does not invent these records or pretend to save a
platform setting.

To finish the remaining SRS 4.12 items, backend work is still required for:

- administrator order/payment search;
- retained payment-attempt and dispute records plus monitoring endpoints;
- a validated, audited platform-settings endpoint for future activation fees.

No password, token, API key or production secret is included in this branch.
