# RebohromePayment rollout

New external deposits and purchases use RebohromePayment, with Cash App (`cash-app-v4`) and Bank Transfer (`banking`), in USD. The server integrates the MerchantPayd API. Internal Wallet remains available. Creation of new legacy payments is retired; existing provider handlers and reconciliation remain.

## Configuration and migration

Server-only configuration: `MERCHANTPAYD_API_BASE_URL`, `MERCHANTPAYD_API_KEY`, `MERCHANTPAYD_API_SECRET`, `MERCHANTPAYD_WEBHOOK_SECRET`, `MERCHANTPAYD_PAYMENT_METHOD`, `MERCHANTPAYD_ENABLED`. Examples contain empty credentials. Production credentials are stored in Vercel, outside Git. Creation is disabled unless `MERCHANTPAYD_ENABLED=true`.

Initialize a clean local database with `npm run db:setup`, then run `npm run db:migrate-payments` with an explicit local `DATABASE_URL`. Seed only an isolated database, with a chosen `ADMIN_SEED_PASSWORD` of at least 12 characters. Remote migration requires `--remote` and explicit database credentials; it is not run during a build or HTTP request. The migration preserves historical records and adds neutral provider IDs, payment intents, attempts, a durable inbox, financial entries, jobs, auth limits and cart versions. Historical columns are added explicitly as well.

Production migrations `merchantpayd-v1` and `legacy-columns-v1` were applied on 2026-09-10 after a rehearsal against the production schema and snapshots of affected tables. Profile count and balance aggregates were unchanged. Private backups are stored locally outside Git.

## Payment processing

- Create requests require an `Idempotency-Key`. Changed parameters under the same key produce a conflict. An uncertain create response remains `creation_unknown`; do not retry the provider POST or ask the customer to pay again.
- The registered webhook is `POST /webhook/merchantpayd`. HMAC-SHA256 is checked against raw bytes before the event is persisted. Status API verification precedes financial effects.
- Credits use the agreed USD amount, not the merchant settlement net of fees. Original/gross/net/conversion details remain in the provider snapshot.
- A unique financial effect and database transaction prevent duplicate balance or inventory changes. A paid order that cannot be fulfilled remains `paid_unfulfilled` and can be retried.
- The waiting page polls without overlapping requests, starting at five seconds and backing off on errors. It provides a normal checkout link; provider redirect parameters are not required.
- `/api/cron/reconcile-merchantpayd` requires `Authorization: Bearer CRON_SECRET`. The Vercel schedule runs every five minutes. Missing webhooks and saved unmatched events remain recoverable. Old unresolved links continue daily checks.
- `/admin/payments` displays payments needing review and unmatched events. Its retry action checks provider status; it does not manually mark a payment paid.

## Release gate and rollback

The production flag stays **false** until the outstanding acceptance work in the diagnostic register is complete. Deploying this code does not enable external payments. Disable creation with the same flag during rollback; preserve webhook and reconciliation processing for existing links. Never roll back by removing financial entries or replaying historical credits.

Verification commands: `npm run test:payments`, `npm run test:randomized-packs`, `npm run test:coinflow-country`, `npm run typecheck`, `npm run build`. All application checks must use an isolated database and empty external service credentials. No smart-contract work or real payment creation is part of these tests.

`payments:preflight` is a read-only authenticated status probe. A 404 for a nonexistent link verifies API authentication but does not establish that Cash App 4 is enabled in the merchant project or prove a successful real payment.

On 2026-09-15, Bank Transfer was added to the payment-method selector alongside Cash App. Credit Card, Apple Pay and Google Pay remain visible but disabled. The selected method is part of the immutable intent snapshot and idempotency checks. Provider status is validated against that saved method. Public provider branding is RebohromePayment; protocol routes and environment variable names remain stable.
