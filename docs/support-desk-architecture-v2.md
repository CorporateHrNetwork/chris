# CHRiS Support Desk — Internal Operations vs Client Support Architecture

Status: Approved architecture correction
Pilot client: Zermatt Liquor Limited
Support channels: WhatsApp +234 911 299 3759, support@crnetwork.com.ng
Engineering escalation repository: CorporateHrNetwork/chris

## 1. Architectural principle

CHRiS Support Desk is primarily a Corporate Resources Network internal support-operations capability. It must not be implemented as a normal tenant Settings workspace.

The system is split into two planes:

### A. CHRiS Internal Support Operations Plane

Audience: Corporate Resources Network / CHRiS support administrators, support agents, engineers and product/support management.

Purpose:
- operate support across all CHRiS clients;
- receive and triage WhatsApp/email/in-app cases;
- monitor P1–P4 severity and SLA clocks;
- assign/escalate engineering work;
- link GitHub issues, commits and deployments;
- manage client communications and validation;
- identify recurring defects and product-improvement themes;
- maintain the support knowledge base;
- view cross-client support analytics without exposing one client's data to another.

This plane must have an explicit platform-level authorization boundary. Tenant `settings.view` alone is not sufficient for cross-client access.

### B. Client Support Plane

Audience: authorised users within one CHRiS client tenant.

Purpose:
- submit a support request;
- see only that tenant's own cases;
- reply to Support Desk conversations;
- upload approved evidence/screenshots;
- see status and safe client-facing updates;
- confirm resolution or request reopening.

A client must never see another tenant's cases, internal engineering notes, security diagnostics, private GitHub metadata, internal SLA commentary or other CHRiS operational information.

## 2. User experience

### Client

Primary channel:

WhatsApp -> CHRiS Support Agent -> tenant-scoped ticket -> status updates -> client validation -> closure

Optional in-app area:

My Support Requests
- Submit Request
- Open Requests
- Awaiting Response
- In Progress
- Resolved
- Conversation
- Confirm Resolution / Reopen

### CHRiS internal team

Dedicated module:

CHRiS Support Desk
- Operations Dashboard
- All Client Cases
- Conversations
- SLA Queue
- P1/P2 Incidents
- Engineering Escalations
- Improvement Requests
- Knowledge Base
- Client Feedback
- Support Analytics
- Administration

The internal dashboard must support filters for client, severity, category, CHRiS module, SLA state, assigned support agent/engineer, status and date.

## 3. Authorization model

Introduce platform-scoped support authorization that is distinct from tenant HR permissions.

Recommended internal roles:
- CHRIS_SUPPORT_ADMIN
- CHRIS_SUPPORT_AGENT
- CHRIS_SUPPORT_ENGINEER
- CHRIS_SUPPORT_MANAGER (later)

Recommended client permission:
- support.view_own
- support.create
- support.reply
- support.validate_resolution

Internal support roles may access multiple client tenants only through audited platform support services. They must not receive unrestricted cross-tenant HR/payroll access merely because they can support multiple tenants.

## 4. Data isolation

Every support case must retain:
- client / tenant organisation id;
- external contact identity and channel;
- ticket number;
- case category and severity;
- affected CHRiS module;
- branch/location where relevant;
- public/client-visible conversation;
- private/internal notes separately;
- SLA timestamps;
- engineering escalation references;
- deployment/fix references;
- resolution and client validation;
- immutable audit history.

Cross-client queries are allowed only from the internal Support Desk service after platform-level authorization. Tenant APIs remain tenant-scoped by default.

## 5. AI agents

The approved agents remain:

1. Client Support Agent
2. Triage & Incident Agent
3. Engineering Liaison Agent
4. Resolution & Follow-up Agent
5. Knowledge & Improvement Agent

Agents operate behind the Support Desk service and must never bypass authorization, tenant isolation, audit requirements or human approval controls for sensitive production actions.

## 6. Safety / privacy controls

The Support Desk must never request or expose:
- user passwords;
- OTPs;
- private access tokens;
- database credentials;
- unrestricted payroll exports when unnecessary;
- secrets in GitHub issues or WhatsApp messages.

Sensitive evidence must be redacted or moved to controlled storage where required.

## 7. Migration from Release 1 pilot console

The Release 1 console currently exposed under tenant Settings is a pilot/test console only.

Required correction sequence:
1. Create a dedicated internal Support Desk route/module outside tenant Settings.
2. Introduce platform-support authorization before enabling cross-client reads.
3. Move the current operational dashboard to the internal module.
4. Replace the tenant Settings exposure with a restricted `My Support Requests` client experience.
5. Keep Zermatt as the first pilot tenant.
6. Preserve existing ticket/audit records during migration.
7. Connect GitHub escalation and WhatsApp only after authorization and tenant-routing acceptance tests pass.

## 8. Acceptance criteria

The architecture is accepted only when:
- Zermatt users can see only Zermatt support requests;
- a future second client cannot see Zermatt requests;
- CHRiS internal support users can view authorised cases across clients from the internal console;
- cross-client access is explicitly platform-authorised and audited;
- client-visible and internal-only notes are separated;
- WhatsApp messages resolve to the correct tenant/contact/ticket;
- GitHub engineering escalations contain no client secrets;
- case lifecycle and SLA events remain auditable;
- resolution requires appropriate support workflow and client validation where configured.
