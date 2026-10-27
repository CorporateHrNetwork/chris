# Zermatt employee celebrations

Birthday and completed-year work anniversary greetings use Africa/Lagos calendar dates, eligible current employee records and the latest onboarding DOB. February 29 is observed on February 28 in non-leap years. The email display name and each message body use `Zermatt Liquor Limited | Powered by CHRiS`. ESS event posts remain enabled. Existing organization birthday/anniversary switches are honored.

## Activation

Only on the live Zermatt API, set `CHRIS_CELEBRATION_AUTOMATION_ENABLED=true`. Leave this unset in demo and staging. Set `CHRIS_CELEBRATION_GITHUB_OIDC_ENABLED=true` on the live API. GitHub Actions authenticates with short-lived signed OIDC tokens, pinned to this repository ID, owner ID, main branch and exact workflow path; no shared GitHub secret is required. Optional administrator status access uses a random secret of at least 32 characters in `CHRIS_CELEBRATION_CRON_TOKEN`. Never commit credentials. The scheduled workflow must be present in the repository **default branch** to run automatically; the live API branch alone does not activate GitHub schedules. Start time is 08:07 Lagos with hourly same-day recovery through 19:07. GitHub schedules can be delayed; this is best effort, not a delivery-time SLA. An internal 15-minute timer supplements it while the API is running, between 08:00 and 20:00 Lagos. Neither path backfills past dates.

Email needs `RESEND_API_KEY` and an actual verified sender mailbox in `CELEBRATION_EMAIL_FROM` (or existing `PAYROLL_EMAIL_FROM` / `RESEND_FROM`). The display name is overridden, not the verified mailbox domain.

Use the existing HTTPS SMS webhook where available (`CELEBRATION_SMS_WEBHOOK_URL`, falling back to `PHONE_NOTIFICATION_WEBHOOK_URL`). Optional `CELEBRATION_SMS_WEBHOOK_TOKEN` is sent as a bearer token. The bridge must deduplicate `Idempotency-Key` and return `{ "accepted": true, "messageId": "provider-id" }` **only after SMS provider acceptance**. An HTTP 200 without acknowledgement is not enough. The bridge must use SMS, not WhatsApp, honor recipient restrictions, and pass through the full branded body. Existing bridges using a weaker response contract need updating before activation.

Alternatively, Termii support is included. Configure `TERMII_API_KEY`, the account-specific `TERMII_BASE_URL` from the Termii dashboard, and an approved `TERMII_SENDER_ID` such as `ZermattLtd`. Its SMS sender ID limit is 11 characters, so the full company name and CHRiS signature remain in the body. The generic route is used for greetings; DND numbers and operator time restrictions may prevent delivery. A funded account and approved sender ID are required; no account or paid credit is provisioned by this change. Webhook takes priority if both are configured.

## Verification

Authenticated `GET /api/internal/zermatt-celebrations/status` returns configuration booleans only and sends nothing. Authenticated `POST .../dispatch` accepts an empty JSON body only; it cannot select another tenant, employee or date. It returns 503 if configuration is missing or delivery is incomplete. Logs and summaries contain channel counts, not employee contacts. `SENT` in the existing ledger means provider acceptance, not handset/inbox delivery; actual delivery needs provider delivery reports.

The existing unique ledger claim prevents concurrent duplicate sends per tenant, employee, event, date and channel. Resend also receives a stable idempotency key. Missing contacts/configuration remain retryable with a recorded reason. A timeout, missing provider acknowledgement, crash after claiming, or uncertain acceptance remains PROCESSING for manual reconciliation; do not delete that row or retry without checking the provider. Stale PROCESSING rows are deliberately not auto-replayed. Failures confirmed rejected by a provider can be retried. ESS post IDs are deterministic to avoid duplicate posts after a partial failure.

## References

- https://resend.com/docs/dashboard/emails/idempotency-keys
- https://developers.termii.com/messaging-api
- https://developers.termii.com/sender-id

- https://docs.github.com/en/actions/reference/security/oidc
