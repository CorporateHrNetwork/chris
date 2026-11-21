# CRNETWORK–CCA — 4 December 2026 launch gates

**Owner:** Corporate Resources Network engineering and operations  
**Target:** Friday 4 December 2026 (Africa/Lagos)  
**Status:** EXECUTION IN PROGRESS — not certified launched  
**Scope policy:** Launch a narrowly verified, secure managed-infrastructure control plane. Do not describe unimplemented domain, hosting or certificate automation as operational.

## Strategic target

Corporate Resources Network will provide **managed technology infrastructure services** using CCA as a secure, auditable customer and operator control plane. CHRiS is the first intended application and proving tenant. The long-term catalogue includes PostgreSQL, domain/DNS, SSL/TLS, managed servers, application hosting, encrypted backups, recovery, monitoring and support.

### Day-one launch scope: minimum viable, honest and supportable
1. **CCA identity / support / tenant lifecycle:** Access-controlled service intake, admin review, auditable state transitions, support escalation, and demonstrated tenant isolation on fictional staging records.
2. **Managed PostgreSQL staging service:** Repeatable isolated provisioning and restore for a fictional tenant, with documented credentials custody, restricted network exposure, monitoring and off-site encrypted backups. Use actual tested infrastructure rather than an unproven production promise.
3. **Backup / disaster-recovery control:** Evidence of scheduled successful backups, independently verified integrity and restore rehearsal, plus alerts and an operator runbook.
4. **Service catalogue / requests:** Offer **request intake only** for Domain Registration, DNS, SSL/TLS, Servers/VPS and Hosting unless a contracted upstream provider has been integrated and the associated provisioning, billing and rollback tests have passed. A catalogue entry is not proof of fulfilment.
5. **Billing / customer commitments:** No automated sales, payments, guaranteed SLA, domain transfer or certificate issuance until the provider's commercial terms, prices, invoicing, escalation and operations have been tested.

### Excluded from the 4 December minimum launch unless independently proven
- Zermatt production database cutover from Supabase; do not make this a prerequisite for CCA pilot launch without separately approved recovery and rollback.
- Restoration of 81 Zermatt employee document binaries: metadata-only diagnostic does not establish recoverability.
- Public document diagnostic endpoint or ad hoc production filesystem inspection.
- Operating public customer hosting on a single Windows staging computer.
- Self-accredited registrar or certificate authority status.
- Claims of operational DNS/SSL/server ordering, provisioning or renewal before provider credentials, legal terms and end-to-end tests exist.

## Milestone schedule and evidence expected

| Gate | Date (Africa/Lagos) | Acceptance evidence | If failed |
|---|---|---|---|
| G1 — Recovery baseline | 20 Nov | Independent checkpoint of CCA staging and current CHRiS production changes; encrypted off-site copy, integrity verification and clearly documented restoration scope | No database cutover or production recovery claim |
| G2 — CCA staging isolation | 24 Nov | Fictional isolated PostgreSQL tenant; service authorization tests, network/secret isolation and restoration rehearsal | Keep staging internal |
| G3 — PR #306 diagnostic rehearsal | 26 Nov | Test-only, one-shot staging runner with fictional records, denied production connection, disabled-by-default controls and zero exposed paths; **production job remains separately gated** | Retain PR as draft |
| G4 — CCA client workflow acceptance | 27 Nov | Service request, tenant approval, provisioning simulation, audit trail, suspension and support incident tests with fictional clients | Launch only the passing features |
| G5 — Catalogue and policy readiness | 30 Nov | Clear available-versus-request-only service labels; domain/SSL/server vendor due diligence and customer terms | Advertise request-only catalogue |
| G6 — Security and recovery go/no-go | 2 Dec | Recorded audit, credential custody, restore RTO/RPO evidence, smoke tests, incident runbook, designated operator and rollback | **No public launch** |
| Launch decision | **4 Dec** | Controlled opening only for services that passed G1–G6; signed operational owner acceptance and published limitations | Launch as internal pilot or postpone public service |
| Supabase risk checkpoint | 11 Dec | Separate plan for Supabase usage/grace risk; verified compliance-staging migration or continued safe fallback | Keep old project intact with backups |

## Existing work — current evidence, not generalized production certification

- Independent Windows CCA staging API and dedicated PostgreSQL tested previously with fictional operator and branch access; local validation has reported 87 tests passed.
- Encrypted off-site CCA staging backup / restore scheduled tasks have been tested; unattended execution reliability requires continued confirmation.
- Zermatt production public-schema backup and 122-table isolated PostgreSQL restore previously verified. This does **not** certify full Supabase auth, storage or file recovery.
- PR #306 is open/draft and does not ship a production diagnostic. A fictional-only CLI execution rehearsal was added with 4 new pass/fail safety tests; all 30 diagnostic tests passed in a clean isolated worktree on 18 Nov. **It cannot inspect the 81 real files.**
- Supabase compliance staging project `amnbmmewmvbtiylhquin` was ACTIVE_HEALTHY when checked on 18 Nov but has an inactivity-pause warning. It is separate from the Zermatt production project.

## Required safety and implementation decisions

- Any customer credential, database password or secret is stored in an authorized vault, never GitHub, logs, chat, test fixtures or client-side code.
- Do not add public privileged diagnostic endpoints, broad RLS bypasses, destructive production migrations or unsupervised payment actions.
- Prefer low-capital provider-backed domain/VPS services initially; explicitly display third-party providers and renewal responsibility when applicable.
- TLS certificates may use automated ACME validation when validated; free certificate issuance itself is not a paid proprietary certificate.
- Keep CCA development commits separate from production CHRiS branch merges. Render autoDeploy is enabled for Zermatt; a code or doc merge to its tracked branch may deploy. Work in review branches until release approval.
- Distinguish **proof in staging** from **customer-ready operation**. Do not mark a gate passed solely because a script, UI or PR exists.

## Next operator tasks, in order

1. Preserve dirty pre-existing `C:\Users\developer\cca-local` development files. Test new PR code in isolated checkout.
2. Complete PR #306 staging one-shot audit runner and tests; keep it unmerged, never connect to live records without independent authorization and direct source-storage evidence.
3. Inventory compliance-staging Supabase schema and dependency map with read-only tools, compare to isolated PostgreSQL, and run a synthetic migration and restore rehearsal.
4. Verify live CCA scheduled backup and restore histories and document genuine headless outcomes.
5. Build and test request-only catalogue gates for domains, DNS, SSL, managed servers, hosting and PostgreSQL, without false provider capabilities.
6. Record launch go/no-go with failures, owners and explicit limitations on 2 December; open only the verified services on 4 December.
