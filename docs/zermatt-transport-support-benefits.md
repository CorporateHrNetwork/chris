# Transport Support Pay in Benefits

Transport Support Pay is managed at `/benefits/transport-support`; its reference-gross preparation workspace is `/benefits/transport-support/preparation`. Payroll workspace links are removed; existing bookmarked URLs redirect to Benefits. API clients use `/api/benefits/transport-support` and its `/preparation` child.

All public operating endpoints, including legacy API aliases, construct the service with `benefitsOnly: true`. Benefit activation writes an immutable, tenant-scoped OrganizationAudit configuration event; it never enables payroll split settings, retires or inserts salary rates, or marks regular payroll drafts for recalculation. The new Benefits configuration takes precedence over historical split settings. Historical settings remain read-only for compatibility.

The existing transport register, lines, events and unpaid/overpaid balances are reused. No second ledger is created, so an existing paid month cannot be regenerated as another benefit payment. Approval assignments, tenant isolation, reconciliation, bank-detail checks, release controls and zero loan/statutory deductions are preserved.

Calculation bases are read from reviewed reference-gross preparations or existing authoritative full-gross salary records. Missing full-gross data blocks processing; reduced end-month salary is never inferred to be full gross. Preparation stores reference data only. Activated legacy salary-linked rows remain protected.

Regular Nigeria payroll calculation, salary allocation formulas, payroll approval service, payslips and financial history are unchanged by this move. Existing salary-allocation configuration is not automatically disabled or rewritten: doing so could change pay. No production benefits activation or employee payment is performed during deployment.

Validation includes a disposable PostgreSQL lifecycle: enable Benefits despite an overlapping approved payroll, generate, submit, audit, GM approval and confirm payment. Protected salary rates, periods, payroll runs/lines, loans and split settings must remain byte-identical. All fixture changes roll back. The existing payroll and settlement regression workflows also run.
