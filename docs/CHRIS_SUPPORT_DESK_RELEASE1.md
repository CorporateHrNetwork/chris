# CHRiS Support Desk — Release 1

## Product identity

**CHRiS Support Desk**  
Client Support, Issue Resolution & Product Improvement Centre

- WhatsApp: **+234 911 299 3759**
- Email: **support@crnetwork.com.ng**
- Pilot client: **Zermatt Liquor Limited**
- Engineering repository: **CorporateHrNetwork/chris**

## Release 1 operating chain

Client portal / WhatsApp / controlled manual intake → Client Support Agent → Triage & Incident Agent → Support case → SLA priority → first-line response or Engineering Liaison Agent → GitHub engineering issue → engineer resolution → Resolution & Follow-up Agent → client validation → closure → Knowledge Agent.

## Agents

### Client Support Agent
Acknowledges client messages, applies privacy guardrails and captures the minimum information needed for a case. It must never request passwords, OTPs, access tokens, database credentials or unnecessary sensitive employee/payroll information.

### Triage & Incident Agent
Classifies support traffic into:

- Query
- Incident
- Bug
- Access Issue
- Data Issue
- Configuration Request
- Improvement Request
- Security Concern

It also maps business impact into P1 Critical, P2 High, P3 Medium or P4 Low.

### Engineering Liaison Agent
Produces an engineer-ready GitHub brief with ticket number, tenant, category, severity, module, client description, expected/actual behaviour, business impact, reproduction/evidence and acceptance criteria.

### Resolution & Follow-up Agent
Produces consistent client-facing updates when a case is assigned, in progress, fix-ready, deployed, awaiting validation, resolved or closed.

### Knowledge Agent
Captures reusable resolutions from successfully resolved/closed cases. Security-sensitive cases are excluded from automatic reusable knowledge capture.

## Support lifecycle

`NEW → TRIAGED → AWAITING_CLIENT → ASSIGNED → IN_PROGRESS → FIX_READY → DEPLOYED → CLIENT_VALIDATION → RESOLVED → CLOSED`

Additional states: `ESCALATED`, `BLOCKED`, `REOPENED`, `CANCELLED`.

`CANCELLED` is requester-controlled only while a case is still unattended. CHRiS permits cancellation of a `NEW` or automatically `TRIAGED` request only when Support has not replied, changed the case, assigned it or escalated it. Cancellation never deletes the case; requester, reason and timestamp remain in the audit trail.

## Client Support workspace

Every authenticated tenant user has access to **My Support Requests** at:

`/support`

The requester can:

- create and track their own requests;
- open the full client-visible case workspace;
- read Support responses and case updates;
- add follow-up information while the case remains active;
- cancel an unattended request with a recorded reason;
- confirm a resolution while the case is in `CLIENT_VALIDATION`;
- reopen a `RESOLVED` or `CLOSED` request with a reason so the existing history remains connected.

Cancelled, resolved and closed requests cannot receive new client messages through stale UI or direct API calls. Resolved/closed cases must first be reopened.

## Internal Corporate Resources Network Support workspace

The cross-client Support Desk is available at:

`/support-desk`

It is platform-only and requires:

- `support.internal.view`
- `support.internal.manage` for case/status/message management
- `support.engineering.escalate` for engineering escalation

These permissions are provisioned only for the Corporate Resources Network platform organization (`corporatehr-network`). Tenant Role Management excludes `support.internal.*` and `support.engineering.*`, and authorization middleware rejects platform Support permissions outside the platform organization even if a stale/incorrect database assignment exists.

A dedicated system role, **CHRiS Platform Support**, is provisioned for Corporate Resources Network. Existing CorporateHr Network Administrators are granted platform Support access by the controlled migration so the Support Desk is operable after deployment without granting client administrators cross-tenant access.

Internal Support operators can:

- view the cross-client case queue and metrics;
- open a client case and review client-visible plus internal history;
- record client-visible responses;
- record internal investigation notes hidden from the client;
- update the support status;
- save a resolution summary;
- escalate a validated case to Engineering/GitHub;
- review cancelled requests without reactivating them.

## Release 1 persistence

Release 1 deliberately uses the existing append-only `OrganizationAudit` ledger for support tickets, messages and reusable knowledge records. This avoids introducing a new support schema before pilot acceptance and preserves a tamper-evident event history. A dedicated Support Desk schema can be introduced after pilot validation without losing Release 1 history.

Entity types:

- `SupportTicket`
- `SupportMessage`
- `SupportKnowledge`

## Runtime configuration

Secrets must be stored in the deployment environment and must not be committed to Git.

### WhatsApp Business Platform

- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_APP_SECRET`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_GRAPH_VERSION`
- `SUPPORT_PILOT_ORGANIZATION_SLUG=zermatt-liquor-limited`

Webhook URL after backend deployment:

`https://<CHRIS_BACKEND_HOST>/api/support-desk/whatsapp/webhook`

Production inbound webhook traffic is rejected unless the Meta app secret is configured and the `x-hub-signature-256` signature validates.

### GitHub engineering escalation

- `GITHUB_SUPPORT_TOKEN`
- `GITHUB_SUPPORT_REPO=CorporateHrNetwork/chris`

The token should have only the minimum repository issue permission required for the Support Desk integration.

## Pilot acceptance

Release 1 is accepted only after the following are demonstrated in the hosted Zermatt/CHRiS environment:

1. Client support intake creates an auditable ticket.
2. Triage assigns category, CHRiS module and P1–P4 severity.
3. Client and internal support queues/metrics load correctly.
4. Client users can open their own case workspace, send follow-up information and cannot see internal notes.
5. Unattended cases can be cancelled by the requester with a retained audit trail; attended cases cannot be cancelled by the requester.
6. Internal Support can send client-visible responses and record internal notes.
7. Status changes append events and preserve ticket history.
8. A resolution can be saved, sent for client validation, confirmed by the requester and reopened when necessary.
9. Engineering escalation generates the structured brief and creates a GitHub issue once runtime credentials are configured.
10. WhatsApp webhook verification succeeds with the official Meta configuration.
11. An inbound WhatsApp text creates a Zermatt support case and returns the CHRiS case reference.
12. No secret credentials are requested or written into support case content by the agents.
13. Cross-client internal Support access is denied to client-tenant roles and users.

## Next increment after current Release 1 workflow acceptance

- Dedicated relational support schema and SLA timer records.
- Multi-client WhatsApp routing instead of pilot-tenant routing.
- Attachment/media handling with controlled storage and malware/content safeguards.
- SLA breach notifications and escalation scheduler.
- Searchable knowledge base and recurring-problem analytics.
- Optional model-provider adapter for richer natural-language assistance while retaining deterministic security, classification and escalation controls.
