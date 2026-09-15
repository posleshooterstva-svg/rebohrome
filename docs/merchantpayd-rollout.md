# RebohromePayment rollout

New external deposits and purchases use RebohromePayment, with Cash App (`cash-app-v4`) in USD and Bank Transfer (`banking`) in EUR. The account balance and catalog accounting remain in USD. The server integrates the MerchantPayd API. Internal Wallet remains available. Creation of new legacy payments is retired; existing provider handlers and reconciliation remain.

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

On 2026-09-15, the owner explicitly authorized production activation of Cash App and Bank Transfer. `MERCHANTPAYD_ENABLED=true` is configured in Vercel production. Credit Card, Apple Pay and Google Pay remain disabled. This activation does not declare the outstanding audit/acceptance work complete. Disable creation with the same flag during rollback; preserve webhook and reconciliation processing for existing links. Never roll back by removing financial entries or replaying historical credits.

Verification commands: `npm run test:payments`, `npm run test:randomized-packs`, `npm run test:coinflow-country`, `npm run typecheck`, `npm run build`. All application checks must use an isolated database and empty external service credentials. No smart-contract work or real payment creation is part of these tests.

`payments:preflight` is a read-only authenticated status probe. A 404 for a nonexistent link verifies API authentication but does not establish that Cash App 4 is enabled in the merchant project or prove a successful real payment.

On 2026-09-15, Bank Transfer was added to the payment-method selector alongside Cash App. Credit Card, Apple Pay and Google Pay remain visible but disabled. The selected method is part of the immutable intent snapshot and idempotency checks. Provider status is validated against that saved method. Public provider branding is RebohromePayment; protocol routes and environment variable names remain stable.

## Provider validation on 2026-09-15

A controlled USD 10 link-creation check returned 201 for Cash App (`cash-app-v4`) and 422 for Bank Transfer (`banking`): the provider reported that banking is not enabled for this project. No payment was made. Bank Transfer is enabled in the site selector, but requires activation in the provider project before it can create links. The API credentials do not provide documented project-administration access.

Known disabled-method errors now return an actionable public message. Raw provider diagnostics are not exposed. A definitive rejection keeps its explanation and permits a fresh, user-initiated request with a new key; ambiguous creation keeps its original key and reconciliation protection.

The owner subsequently supplied separate API credentials and a webhook signing secret for the Bank Transfer project. These are stored as `MERCHANTPAYD_BANKING_API_KEY`, `MERCHANTPAYD_BANKING_API_SECRET`, and `MERCHANTPAYD_BANKING_WEBHOOK_SECRET`, locally outside Git and as sensitive Vercel production variables. With those credentials, the Bank Transfer USD 10 create probe returned 201. No payment was made. Creation and reconciliation select credentials from the saved payment method, without falling back to the Cash App project. The shared webhook endpoint accepts signatures from either configured project; independent status verification still precedes every financial effect.

## Bank Transfer EUR-only payments

New Bank Transfer requests must use EUR; Cash App remains USD. The configured site EUR/USD rate (`EUR_USD_FALLBACK_RATE`, existing default 1.08) is disclosed before payment and stored with the exact EUR amount and USD accounting amount in the immutable intent snapshot. This is the site conversion rate, not a live market-rate claim. A changed rate requires refreshing and reviewing the payment. Deposit limits remain denominated in USD and are checked after conversion. Purchases convert the server-computed USD order total to EUR. Amounts are rounded once to cents with integer arithmetic.

Receipts and transactions preserve original EUR amounts; account credits use the agreed USD amount. Status verification requires the exact EUR base amount for new bank payments. Previously created USD bank links continue reconciling their original terms. No historical balances or links were rewritten. A controlled EUR 10 create request was accepted by the provider; no payment was made.

## Closing sessions

Closing a RebohromePayment session now checks the provider and atomically sets the intent `closed_at` together with the session closure, releasing purchase reservations within that transaction. Creation-unknown, actively processing, paid and review-required intents cannot be dismissed to bypass the payment lock. The browser clears the closed request key. Open payments are displayed from payment intents, without filtering them out by legacy session expiry. Both shared status controls and the waiting page use the same reconciliation path.

The provider status API was observed returning `expired`; it is accepted without a financial effect and remains eligible for later reconciliation. Closed pending links stay hidden after a status refresh. A verified later settlement still credits or fulfills exactly once. One production record already canceled by the user had an expired legacy session but a pending intent; its provider expiration was verified and the mismatch repaired with a private backup and unchanged balance.
