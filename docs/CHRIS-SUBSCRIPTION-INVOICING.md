# CHRiS subscription, customer selection and invoicing — implementation handoff

**Status: draft implementation only. Not deployed.** This change adds a server-reusable pricing catalogue; no routes, email sends, invoicing, entitlement enforcement or database migrations are enabled.

## Published catalogue / basis
- Licence per employee **per month**: Basic ₦1,200; Standard ₦1,500; Premium ₦1,700.
- Optional ESS per employee **per month**: Basic ₦700; Standard ₦800; Premium ₦900.
- Onboarding **once per employee at initial implementation**: Basic ₦500; Standard ₦500; Premium ₦500. New hires later should not automatically incur repeat implementation charges.
- Support per employee **per year**: Basic ₦700; Standard ₦800; Premium ₦900.
- Illustrative VAT 7.5% only when legally applicable and determined at invoice issuance. Billing frequency must be prominently disclosed.
- Included HRIS & ESS entitlements are exported from `backend/src/services/subscriptionPricing.js`. Mandatory employee records, payslips and statutory access must not become inaccessible where applicable law or contract requires provision.

## Approved commercial policy (pricing Version 2)
- Full payment is required to commence deployment/implementation; target completion within one calendar month from confirmed payment date, subject to client readiness.
- The first annual licence term starts on the verified payment date, **not** the production go-live date.
- No complimentary grace period or free additional month applies.
- Onboarding is ₦500 **per employee once** for every plan; excluded from ordinary renewals.
- Renewals are annual from the confirmed payment anniversary; require payment for uninterrupted access. Any suspension policy requires separate contractual/legal approval and must protect statutory records and data export rights.
- Manual payment verification currently changes invoice status only and **does not activate** a subscription, create entitlement periods, or enforce the licence calendar. Those capabilities remain release blockers.

## Proposed production workflow (requires implementation, QA and approval)
1. Admin securely creates invitation with unique expiring signed token and emails recipient a portal link.
2. Recipient verifies authorised billing email, selects Basic/Standard/Premium, enters active employee count, toggles ESS, accepts terms and submits.
3. Server **recalculates** quote using versioned catalogue and records immutable selection snapshot, tax applicability, client legal details, and consent metadata. Reject client-submitted prices.
4. Generate unique sequential pro forma invoice number **transactionally**; issue PDF with approved CRNetwork logo and invoice fields (invoice date, expiry, applicable VAT, line items, totals, payment details: Zenith Bank PLC, Corporate Resources Network, 1312432840).
5. Deliver invoice email/PDF to verified billing recipient and notification to approved CorporateHr billing mailbox. Use authenticated mail provider, retry queue, delivery logs and idempotency keys.
6. Billing team confirms funds using verified banking evidence before converting to paid/active. Do not automatically activate through request submission.
7. Admin may grant documented pilot concessions or waive onboarding; discounts require approval, audit trail and display as explicit line item. Never change historical invoices when prices change.
8. Keep versions, status transitions, immutable invoice PDF archive and access-controlled client/tenant separation.

## Implementation safety requirements
- Develop and test only on an isolated staging setup. Do not modify Zermatt pilot or Hartland records, tenancy, deployment secrets, access entitlements or payroll.
- Do not publish production email without explicit sender-domain verification, template preview and test-recipient sign-off.
- Never expose account credentials or internal tenant identifiers in shared invoice links.
- Keep generated invoice PDFs accessible only to authorised client and billing staff using signed expiring download URLs.
- Admin-approved module gating must occur only after confirmed commercial migration and must never automatically revoke existing pilot access.

## Acceptance tests still needed
End-to-end invitation → selection → authoritative quote → PDF → two emails → pending status; authenticated downloads; invoice uniqueness and idempotency; VAT exemptions; tampered requests; incorrect email; plan switches; renewals; staging tenant isolation; PDF accessibility; receipt of attachments; opt-out and failed email retries.

The catalogue exports `calculateQuote()` and `getEntitlements()` for the future implementation.

## Implemented on draft branch (not deployed)
- Public React route: `/subscriptions/pricing`.
- API endpoints under `/api/commercial/subscriptions`: GET `/catalogue`, POST `/quotes`, POST `/invoice-requests`, authenticated internal GET `/internal/invoices/:number/pdf`, POST `/internal/invoices/:number/confirm-payment`.
- All endpoints disabled by default until `CHRIS_PUBLIC_SUBSCRIPTIONS_ENABLED=true`; **do not enable in production without QA and security review**.
- Invoice records stored as `OrganizationAudit` events in existing platform organization, without changing the tenant schema. A better dedicated transactional invoice model and invoice-number sequence are required before scale.
- Generated PDF is a basic text-based pro forma invoice using standard PDF syntax, not yet an approved graphical logo template.
- Resend invoice PDF dispatch requires `RESEND_API_KEY` and `RESEND_FROM`; billing copy uses optional `CHRIS_BILLING_NOTIFICATION_EMAIL`. Sender domain, recipient consent and suppression policies must be configured.
- Manual verified payment changes invoice status only, **never** activates employee subscriptions automatically.

## Production-release blockers
1. Implement verified email invitation token flow (avoid sending invoices to unverified user-supplied addresses); add CAPTCHA/rate limits backed by shared persistent storage, input validation, invoice request idempotency and restrictions on public quote requests.
2. Replace audit-event invoice storage with dedicated immutable PostgreSQL invoice, invoice_lines, delivery events, payment verification and subscription entitlement tables; transactional unique invoice numbering.
3. Upgrade PDF with company-approved graphical logo and branding, tax identifiers, due/expiry date, VAT exemption handling and authorization signatures.
4. Add billing dashboard with search, resend, approval and audit permissions. Payment verification must require independent documentary/bank evidence and second-approver controls where appropriate.
5. Run package/unit/integration/UI tests in CI against isolated staging; manually confirm generated PDFs and email attachments; security-review and test multi-tenant isolation.
6. Only after explicit authorization enable flag in staging, test, and separately approve production rollout.
