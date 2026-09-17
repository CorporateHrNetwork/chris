# CHRiS Commercial Website Demo Intake

## Purpose

The CHRiS commercial website is an acquisition channel. CHRiS Commercial Operations is the system of record. Email is a notification and communication channel only.

The live website form should submit to:

`POST /api/commercial/public/demo-requests`

Demo requests must not be created as Support Desk tickets.

## Required submission fields

```json
{
  "companyName": "Example Limited",
  "contactName": "Amina Bello",
  "email": "amina@example.com",
  "phone": "+234...",
  "consent": true
}
```

Recommended fields:

```json
{
  "jobTitle": "Head of HR",
  "country": "Nigeria",
  "employeeCount": 350,
  "locations": 4,
  "modulesOfInterest": ["Payroll", "Leave", "Attendance"],
  "currentHrSystem": "Current HR platform",
  "implementationTimeline": "Within 30 days",
  "preferredDemoDate": "2026-09-25",
  "preferredDemoTime": "11:00",
  "requirements": "We need multi-branch payroll and workforce management.",
  "source": "CHRIS_COMMERCIAL_WEBSITE",
  "referrer": "https://www.google.com/",
  "utmSource": "google",
  "utmMedium": "cpc",
  "utmCampaign": "chris-demo",
  "utmContent": "hero-cta",
  "websiteField": ""
}
```

`websiteField` is the honeypot field and should remain visually hidden and empty for genuine visitors.

## Server workflow

1. Validate required fields, basic email format and explicit consent.
2. Apply public rate limiting and honeypot bot filtering.
3. Resolve the CorporateHr Network platform organization.
4. Create an immutable audit event for the commercial lead before attempting email delivery.
5. Generate a reference such as `CHR-DEMO-YYYYMMDD-XXXXXX`.
6. Apply deterministic lead qualification and commercial priority rules.
7. Route the lead to Lead Qualification, Sales/BD, Demo Coordination and Product/Solution agent queues.
8. Attempt the internal notification to `chris@crnetwork.com.ng`.
9. Attempt a separate acknowledgement to the prospect's submitted email address.
10. Preserve both notification outcomes independently. An email failure must not delete or roll back the lead.
11. Progress the opportunity through the commercial lifecycle.
12. When the opportunity is marked WON, create a controlled implementation handoff to Implementation/Client Onboarding and Customer Success. This does not automatically create a tenant and does not bypass signed terms or human commercial approval.

## Commercial lifecycle

`NEW -> QUALIFIED -> DEMO_SCHEDULED -> DEMO_COMPLETED -> PROPOSAL_REQUIRED -> PROPOSAL_SENT -> NEGOTIATION -> WON | LOST | DEFERRED`

Final pricing, contractual commitments and major customization commitments require human authorization.

## Email adapter

Production configuration:

- `COMMERCIAL_DEMO_INBOX=chris@crnetwork.com.ng`
- `COMMERCIAL_EMAIL_WEBHOOK_URL=<approved mail delivery adapter endpoint>`

The email adapter receives two distinct event types:

- `COMMERCIAL_INTERNAL_DEMO_ALERT`
- `COMMERCIAL_PROSPECT_ACKNOWLEDGEMENT`

No mail credentials or secrets should be committed to source control.

## CORS

The backend uses `CORS_ALLOWED_ORIGINS`. Production must include the exact commercial website origin used by the browser, normally:

- `https://www.chris.crnetwork.com.ng`

If the non-www commercial origin submits requests too, also include:

- `https://chris.crnetwork.com.ng`

Keep existing trusted CHRiS application origins in the same comma-separated environment variable.

## Public success response

A successful request returns HTTP 201 and includes the lead reference, current commercial status, preferred demo date and acknowledgement delivery state. The website should show the lead reference to the prospect and should not treat email delivery state as the authoritative submission result.

## Internal operations

Platform-authorized users manage the pipeline under CHRiS Commercial Operations. Internal endpoints are platform-only and provide summary, lead queue, lead detail, audit activity and controlled status updates with a reason.

## Website deployment note

The live `www.chris.crnetwork.com.ng` website source is not currently present in the connected `CorporateHrNetwork/chris` or `CorporateHrNetwork/Corporatehr-Network-Platform` repositories. The CHRiS API contract and internal workflow are implemented here. The live website form must be updated in its actual hosting/source project to POST this payload to the deployed CHRiS backend endpoint.
