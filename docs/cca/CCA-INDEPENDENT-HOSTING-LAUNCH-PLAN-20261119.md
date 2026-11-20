# CRNETWORK–CCA independent hosting and launch implementation plan

**Date:** 19 November 2026. **Target:** 4 December 2026. **State:** design only, no cloud provisioning authorized by this document.
**Scope:** Independent CCA service, not CHRiS or Zermatt Live. Existing Render workspace `tea-dahvevcs728c73doovgg` has eight inspected services and no dedicated CCA-named service.

## Architecture
- **Public edge:** dedicated CCA hostname, HTTPS-only TLS, strict Host and trusted-proxy handling, secure cookies, minimum necessary CORS origin; no direct exposed PostgreSQL.
- **Service:** separately deployed CCA API/web runtime in a distinct service and deployment branch; liveness and readiness endpoints separated; nonroot process where supported, bounded request limits, structured security event logging with no credentials/OTP/cookies.
- **Data:** independent managed PostgreSQL with unique CCA roles, encrypted storage, application least-privileged read/write role, migration role restricted from runtime, PostgreSQL RLS enforcing server-derived tenant scope, tested transaction rollback and pool lifecycle.
- **Identity:** operator-managed enrollment, password + MFA with real human confirmation; MFA and recovery material never emitted to logs/chat or passed as command arguments; tenant and role assignments derived server-side; device/session revoke, expiry, anti-replay, lockouts, unknown-role quarantine.
- **Backup:** full encrypted off-site backup and integrity manifest, independent restore to isolated environment, documented retention and access boundaries; monitor backup staleness/restore freshness and alert on misses. Local desktop staging remains separate.
- **Monitoring:** externally hosted uptime/status probe and independently delivered error alerts; local-only health audit cannot prove continuity if the PC loses power.
- **DNS/TLS:** create separate pilot name only after service and certificate verified; do not alter existing CHRiS/Zermatt DNS. Verify DNS ownership, automatic certificate renewal, HTTP→HTTPS and HSTS appropriate to audited domain.
- **Separation:** environment variables and secrets per environment; no shared CHRiS/Zermatt customer database or service accounts. Use fictional pilot records only pending launch security signoff.

## Ordered implementation sequence
1. Establish approved CCA pilot budget and account ownership; pick separate deployment environment and PostgreSQL resource. Record actual free-tier limitations/costs before creating billable resources.
2. Build deployable runtime adapter that injects a CCA PostgreSQL pool and validates runtime session and server-bound tenant ID. Prove no customer-controlled tenant override.
3. Add migration and bootstrap process (idempotent), restricted role provision, health endpoints; run CI fixtures and destructive testing only in fictional disposable environments.
4. Configure dedicated CCA staging service and DB with limited ingress. Keep service non-public during internal security verification where supported.
5. Deploy release candidate from reviewed CCA branch, test HTTPS and isolation; run full restart and independent recovery rehearsal.
6. Establish external monitoring and actionable alert delivery; run failure-injection drills (backup missed, web unavailable, database unavailable, credential expired) without changing existing production systems.
7. Run real operator MFA login locally, then in isolated hosted pilot; check logout/revocation, denied cross-tenant access, stale cookies and unauthorized action.
8. Release go/no-go: owner signs off on security, monitoring, offsite restore, documented RTO/RPO, incident response, legal/privacy and financial readiness.

## Acceptance evidence required
- Exact deployment commit and service/database IDs (after provisioning), no production CHRiS changes.
- HTTP status and authenticated/unauthenticated API checks on dedicated HTTPS hostname, no leaked cookies/secrets.
- Fresh backup verified remotely and restored in isolated environment using authorized private recovery key; post-reboot and signed-out schedules verified independently.
- Real operator MFA confirmation without sharing credentials, tenant RLS deny test, audit trail, logout and session expiration.
- Monitor alert actually delivered to owner using non-sensitive metadata; uptime monitored by independent host.
- CCA request-only catalogue remains REQUEST_ONLY until commercial providers and billing are intentionally integrated.

## Current launch blockers
- Signed-out 20 November 06:30/07:15 WAT tasks not yet observed.
- Durable authentic operator MFA against recovered local workspace not verified.
- No dedicated CCA off-device service in inspected Render workspace; no deployed CCA hosting, DNS or TLS verification.
- Automated failure alert delivery not verified.
- Draft PR #311 not merged. Local script is not certified production-ready.

**No implicit approval** for customer data migration, payments, domain transfer or paid infrastructure.
