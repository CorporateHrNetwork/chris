# CHRiS subscription, customer selection and invoicing — implementation handoff

**Status: draft implementation only. Not deployed.** This change adds a server-reusable pricing catalogue; no routes, email sends, invoicing, entitlement enforcement or database migrations are enabled.

## Published catalogue / basis
- Licence per employee **per month**: Basic ₦1,000; Standard ₦1,200; Premium ₦1,500.
- Optional ESS per employee **per month**: Basic ₦500; Standard ₦600; Premium ₦750.
- Onboarding **once per employee at initial implementation**: Basic ₦300; Standard ₦400; Premium ₦500. New hires later should not automatically incur repeat implementation charges.
- Support per employee **per year**: Basic ₦500; Standard ₦600; Premium ₦700.
- Illustrative VAT 7.5% only when legally applicable and determined at invoice issuance. Billing frequency must be prominently disclosed.
- Included HRIS & ESS entitlements are exported from `backend/src/services/subscriptionPricing.js`. Mandatory employee records, payslips and statutory access must not become inaccessible where applicable law or contract requires provision.

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
