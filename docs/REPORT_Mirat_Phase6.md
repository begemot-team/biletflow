# Mirat — Phase 6: platform operations and stabilization

Implementation date: November 25, 2026.
Branches: `feature/mirat-phase6` and follow-up
`feature/mirat-phase6-admin-integration`, both based on the updated `dev` branch.

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
- Completed the follow-up integration after the Platform Admin back-office API was
  merged into `dev`: searchable platform-wide order and payment tables now support
  status, event and date filters.
- Added financial monitoring views for failed checkout/activation payments, refunds
  and payment/refund support disputes.
- Added the dedicated event-report review queue. Administrators can record a review,
  dismiss a report or reopen it while retaining the backend audit metadata.
- Added editable Platform Settings for the activation fee and processing-fee rate,
  including explicit controls to restore deployment defaults.
- Replaced the provisional client-only export notice with authenticated server CSV
  downloads for orders, payments, payment failures, refunds, disputes, activations
  and event reports.

## Verification

- `npm test`: 64 frontend tests passed.
- `npm run lint`: passed.
- `npm run build`: production build passed.
- Python `ruff` checks and source compilation: passed.
- 161 non-concurrency backend tests passed in an isolated SQLite test environment,
  including 15 focused support and cancellation-calendar tests.
- `git diff --check`: passed.
- The five existing concurrency tests require PostgreSQL row-locking semantics and
  cannot run on SQLite. They remain for the PostgreSQL GitHub Actions run; the local
  Docker.app installation could not start because its executable is missing.

## Known optional limitations

- GA4 integration was listed as a bonus and is not part of this MVP delivery.
- Full Kazakh/Russian/English localization remains the team's documented SRS 13.4
  limitation; the Platform Admin operational screens currently use Russian labels.

No password, token, API key or production secret is included in this branch.
