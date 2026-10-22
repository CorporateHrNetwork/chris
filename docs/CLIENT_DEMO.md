# CHRiS isolated client demo

This branch deploys the actual CHRiS frontend and Express API with a new ephemeral PostgreSQL database inside one demo-only container. No production environment files, credentials or database backups are copied.

- Organization: CHRiS Demo Company (chris-demo-company).
- Seven fictional employee records across head office, Abuja, Lagos and Port Harcourt.
- Dedicated HR account: demo.hr@example.invalid (login identifier, not a mailbox).
- Password supplied only through the DEMO_PASSWORD hosting secret.
- Separate JWT secret generated per restart; previous sessions expire on restart.
- Database listens only on loopback; demo guard rejects external database hosts and non-demo database names.
- External integration secrets are refused; commercial, integration, email and account-management endpoints are blocked.
- Demo edits are shared by visitors using this demo account and reset on instance restart. Enter fictional data only.
- The free hosting instance may need time to wake after inactivity.
- Functional sample scope: employee directory/editing, dashboard analytics, payroll sample setup and leave/attendance exploration. This is not a claim that every module in the navigation is fully implemented.

## Deploy
Create a separate Docker web service from branch demo/client-sandbox-20261022, Dockerfile demo.Dockerfile. Set DEMO_PASSWORD to a strong unique password. Use /health for readiness where supported. Do not attach production secrets or environment groups. Do not merge the demo-only defaults into production.

## Verified locally
Fresh migrations; synthetic fixture; login; authenticated user, employees, dashboard, payroll periods and leave policy endpoints. Commercial and user-management routes return 403. Browser verification is recorded in the task report.

## Isolation
Neither live Zermatt nor the existing compliance staging database is used or changed by this deployment. Sample DB is initialized from migrations, not a copy of customer data.
