# Transport Support Benefits: Head HR and external approvals

Head HR prepares the benefit run, records benefit-only inputs, approves it in CHRiS and exports it for external Auditor → General Manager → Chief Accountant approval and payout processing. CHRiS approval means Head HR approval only. Export generation is audited and does not confirm external approval or payment.

The primary Excel sheet and on-screen register share one authoritative 18-column definition. Previous Month Overpayment appears immediately before Net; AccountNO remains text to preserve leading zeroes. The export includes external signature fields, calculation controls and reconciliation of opening/applied/remaining overpayments and actual payments.

Extra/PH days are reference counts. Head HR records the approved Bonus and Overtime/Ph Pay amounts; no new rate formula is assumed. Net = Mid-Month + Bonus + Overtime/Ph Pay + prior earned short payment − capped overpayment recovery. End of the Month is a salary reference only. Remaining overpayment carries forward. Saved inputs survive draft recalculation and are locked after approval.

Actual payment confirmation remains restricted to the assigned Chief Accountant and requires complete receipts or explicit zero-payment reasons. This is separate from the external approval route. Existing internal payroll approval stages and payroll amounts are unchanged.

Old unapproved Transport Support runs in internal Audit/GM stages can be returned by Head HR to draft, recalculated and processed under the new route. Approved and paid records remain locked.

Validation covers Head HR-only approval/export/input editing, authoritative columns and account-number preservation, real PostgreSQL saved-input recalculation and payment reconciliation, and unchanged payroll/loan tables.
