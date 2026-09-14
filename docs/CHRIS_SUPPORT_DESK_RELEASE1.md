# CHRiS Support Desk — Release 1

## Product identity

**CHRiS Support Desk**  
Client Support, Issue Resolution & Product Improvement Centre

- WhatsApp: **+234 911 299 3759**
- Email: **support@crnetwork.com.ng**
- Pilot client: **Zermatt Liquor Limited**
- Engineering repository: **CorporateHrNetwork/chris**

## Release 1 operating chain

Client WhatsApp / manual intake → Client Support Agent → Triage & Incident Agent → Support case → SLA priority → first-line response or Engineering Liaison Agent → GitHub engineering issue → engineer resolution → Resolution & Follow-up Agent → client validation → closure → Knowledge Agent.

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

Additional states: `ESCALATED`, `BLOCKED`, `REOPENED`.

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

## Console access

The Release 1 Support Desk console is available to CHRiS users with `settings.view`. This is intentionally restrictive for the pilot. Dedicated Support Administrator / Support Agent / Engineer permissions are a subsequent RBAC increment after pilot workflow acceptance.

Current console path:

`/settings?workspace=support-desk`

## Pilot acceptance

Release 1 is accepted only after the following are demonstrated in the hosted Zermatt environment:

1. Manual support case intake creates an auditable ticket.
2. Triage assigns category, CHRiS module and P1–P4 severity.
3. Support queue and metrics load correctly.
4. Status changes append events and preserve ticket history.
5. Engineering escalation generates the structured brief and creates a GitHub issue once runtime credentials are configured.
6. WhatsApp webhook verification succeeds with the official Meta configuration.
7. An inbound WhatsApp text creates a Zermatt support case and returns the CHRiS case reference.
8. No secret credentials are requested or written into support case content by the agents.
9. Client validation precedes closure for resolved engineering cases.

## Next increment after Release 1 acceptance

- Dedicated Support Desk RBAC permissions and roles.
- Dedicated relational support schema and SLA timer records.
- Multi-client WhatsApp routing instead of pilot-tenant routing.
- Attachment/media handling with controlled storage and malware/content safeguards.
- SLA breach notifications and escalation scheduler.
- Searchable knowledge base and recurring-problem analytics.
- Optional model-provider adapter for richer natural-language assistance while retaining deterministic security, classification and escalation controls.
