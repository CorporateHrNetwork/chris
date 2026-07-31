 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/documentation/README.md b/documentation/README.md
index 8b137891791fe96927ad78e64b0aad7bded08bdc..1b0b31e4e61635bcd4e9e62519e2b4a6d2414c38 100644
--- a/documentation/README.md
+++ b/documentation/README.md
@@ -1 +1,465 @@
+# CorporateHr Network HRIS Enterprise Software Blueprint
 
+**Version:** 1.1
+
+**Purpose:** Master enterprise blueprint for software architects, UI/UX designers, database engineers, and developers building the CorporateHr Network HRIS platform.
+
+## 1. Enterprise Architecture Blueprint
+
+```text
+                                    Users
+                                      │
+        ┌─────────────────────────────┼─────────────────────────────┐
+        │                             │                             │
+        ▼                             ▼                             ▼
+ Employee Self-Service          HR/Admin Portal              Executive Portal
+        │                             │                             │
+        └─────────────────────────────┼─────────────────────────────┘
+                                      │
+                                      ▼
+                         Authentication & Authorization
+                              (RBAC + MFA + SSO-ready)
+                                      │
+                                      ▼
+                             API Gateway / Router
+                                      │
+        ┌─────────────────────────────┼─────────────────────────────┐
+        │                             │                             │
+        ▼                             ▼                             ▼
+     HR Core                   Payroll Engine                 Loan Engine
+        │                             │                             │
+        ▼                             ▼                             ▼
+ Employees                    Payroll Runs                  Loan Management
+ Departments                  Salary Structures             Loan Policies
+ Branches                     Earnings                      Loan Categories
+ Recruitment                  Deductions                    Loan Requests
+ Performance                  Statutory Rules               Top-Up Loans
+ Training                     Payslips                      Salary Advances
+ Leave                        Payroll Reports               Loan Ledger
+ Attendance                                                  Loan Reports
+        │                             │                             │
+        └─────────────────────────────┼─────────────────────────────┘
+                                      │
+                                      ▼
+                              Workflow Engine
+                                      │
+                 ┌────────────────────┼────────────────────┐
+                 │                    │                    │
+                 ▼                    ▼                    ▼
+        Notification Engine       Audit Engine       Reporting & Analytics
+                 │                    │                    │
+                 ▼                    ▼                    ▼
+        Email / SMS / In-App    Activity Logs       Dashboards / Exports
+                                      │
+                                      ▼
+                         PostgreSQL Database Layer
+                         (Tenant Isolation + Backups)
+```
+
+## 2. System Modules
+
+```text
+CorporateHr Network HRIS
+├── Dashboard
+├── Authentication & Authorization
+├── Company Setup
+├── Branch Management
+├── Department Management
+├── Position Management
+├── Employee Management
+├── Recruitment
+├── Onboarding
+├── Leave Management
+├── Attendance Management
+├── Performance Management
+├── Training Management
+├── Payroll
+├── Loan Management
+│   ├── Loan Policies
+│   ├── Loan Categories
+│   ├── Loan Requests
+│   ├── Loan Approval
+│   ├── Loan Disbursement
+│   ├── Loan Calculator
+│   ├── Loan Ledger
+│   ├── Loan Statements
+│   ├── Loan Top-Up
+│   ├── Salary Advance
+│   └── Loan Reports
+├── Reports
+├── Analytics
+├── Notifications
+├── Workflow Engine
+├── Audit Trail
+├── API Services
+└── System Administration
+```
+
+## 3. Loan Management Blueprint
+
+```text
+Employee
+  │
+  ▼
+Apply for Loan
+  │
+  ▼
+Eligibility Verification
+  │
+  ▼
+Loan Policy Validation
+  │
+  ▼
+Supervisor Approval
+  │
+  ▼
+HR Approval
+  │
+  ▼
+Finance Approval
+  │
+  ▼
+Loan Disbursement Processing
+  │
+  ▼
+Automatic Repayment Schedule
+  │
+  ▼
+Payroll Auto Deduction
+  │
+  ▼
+Loan Ledger Update
+  │
+  ▼
+Outstanding Balance Update
+  │
+  ▼
+Loan Completion / Closure
+```
+
+## 4. Top-Up Loan Blueprint
+
+```text
+Existing Loan
+  │
+  ▼
+Outstanding Balance Review
+  │
+  ▼
+Top-Up Request
+  │
+  ▼
+Eligibility Check
+  │
+  ▼
+Loan Policy Validation
+  │
+  ▼
+Approval Workflow
+  │
+  ▼
+Restructure or Merge with Existing Loan
+  │
+  ▼
+Generate Revised Repayment Schedule
+  │
+  ▼
+Update Payroll Deduction
+  │
+  ▼
+Update Loan Ledger
+```
+
+## 5. Payroll Blueprint
+
+```text
+Employee
+  │
+  ▼
+Salary Structure
+  │
+  ▼
+Allowances
+  │
+  ▼
+Benefits
+  │
+  ▼
+Loan Deduction
+  │
+  ▼
+Salary Advance Deduction
+  │
+  ▼
+PAYE / Income Tax
+  │
+  ▼
+Pension
+  │
+  ▼
+NHF
+  │
+  ▼
+NSITF
+  │
+  ▼
+Other Deductions
+  │
+  ▼
+Net Salary
+  │
+  ▼
+Generate Payslip
+  │
+  ▼
+Bank Payment Schedule
+  │
+  ▼
+Payroll Reports
+```
+
+## 6. Employee Lifecycle Blueprint
+
+```text
+Recruitment
+  │
+  ▼
+Interview
+  │
+  ▼
+Selection
+  │
+  ▼
+Offer Letter
+  │
+  ▼
+Onboarding
+  │
+  ▼
+Employee Profile
+  │
+  ▼
+Payroll Enrollment
+  │
+  ▼
+Leave / Attendance / Performance / Training / Loan Services
+  │
+  ▼
+Promotion / Transfer / Disciplinary Actions
+  │
+  ▼
+Resignation or Termination
+  │
+  ▼
+Exit Management
+```
+
+## 7. Database Blueprint
+
+```text
+Company / Tenant
+├── Branches
+│   ├── Departments
+│   │   ├── Positions
+│   │   └── Employees
+│   │       ├── Payroll Records
+│   │       ├── Leave Records
+│   │       ├── Attendance Records
+│   │       ├── Performance Records
+│   │       ├── Training Records
+│   │       ├── Loan Records
+│   │       ├── Salary Advance Records
+│   │       └── Documents
+│   └── Branch Users
+├── Company Users
+├── Roles & Permissions
+├── Workflow Definitions
+├── Notifications
+└── Audit Logs
+```
+
+### Recommended Core Data Controls
+
+- Every tenant-owned table must include a `tenant_id` or equivalent company identifier.
+- Use foreign keys for organizational hierarchy, payroll, loan, leave, and workflow relationships.
+- Store financial amounts with fixed-precision decimal types, not floating-point types.
+- Keep immutable audit records for approvals, payroll runs, loan transactions, and security-sensitive changes.
+- Apply soft-delete or archival patterns where HR records must remain reportable after deactivation.
+
+## 8. Dashboard Blueprint
+
+```text
+------------------------------------------------------------
+CorporateHr Network HRIS
+------------------------------------------------------------
+Navigation
+Dashboard | Employees | Payroll | Loans | Leave | Recruitment
+Training | Performance | Reports | Analytics | Settings
+------------------------------------------------------------
+Cards
+Total Employees | Active Payroll | Outstanding Loans
+Today's Attendance | Pending Leave | Pending Loan Approvals
+Pending Recruitment | Training Sessions
+------------------------------------------------------------
+Charts
+Payroll Trend | Loan Repayment Trend | Employee Growth
+Department Distribution | Attendance Trend
+------------------------------------------------------------
+Panels
+Recent Activities | Notifications | Pending Approvals
+```
+
+## 9. Security Blueprint
+
+```text
+User
+  │
+  ▼
+Login
+  │
+  ▼
+Authentication
+  │
+  ▼
+Multi-Factor Verification, where required
+  │
+  ▼
+Role Validation
+  │
+  ▼
+Permission Validation
+  │
+  ▼
+Tenant Boundary Check
+  │
+  ▼
+Access Granted
+  │
+  ▼
+Activity Logged
+  │
+  ▼
+Dashboard
+```
+
+### Security Requirements
+
+- Enforce role-based access control for all application routes, API endpoints, and reports.
+- Support multi-factor authentication for privileged users and sensitive actions.
+- Encrypt secrets and sensitive data in transit; encrypt highly sensitive data at rest where appropriate.
+- Maintain audit logs for login events, permission changes, approvals, payroll processing, and loan transactions.
+- Isolate tenant data at the database query, API, and reporting layers.
+
+## 10. Workflow Engine Blueprint
+
+```text
+Employee or Administrator
+  │
+  ▼
+Submit Request
+  │
+  ▼
+Workflow Engine
+  │
+  ▼
+Step 1: Supervisor Review
+  │
+  ▼
+Step 2: HR Review
+  │
+  ▼
+Step 3: Finance Review, when financial impact exists
+  │
+  ▼
+Step 4: Executive Review, when policy threshold requires it
+  │
+  ▼
+Approved / Rejected / Returned for Revision
+  │
+  ▼
+Notification
+  │
+  ▼
+Audit Log
+```
+
+## 11. SaaS Multi-Tenant Blueprint
+
+```text
+CorporateHr Network Cloud
+│
+├── Tenant: Company A
+│   ├── Employees
+│   ├── Payroll
+│   ├── Loans
+│   └── Reports
+│
+├── Tenant: Company B
+│   ├── Employees
+│   ├── Payroll
+│   ├── Loans
+│   └── Reports
+│
+├── Tenant: Company C
+│   ├── Employees
+│   ├── Payroll
+│   ├── Loans
+│   └── Reports
+│
+└── Shared Platform Services
+    ├── Authentication
+    ├── Workflow Engine
+    ├── Notifications
+    ├── API Gateway
+    └── Database Layer with Tenant Isolation
+```
+
+### Tenant Isolation Requirements
+
+- Prefer explicit tenant scoping in every API request and database query.
+- Prevent cross-tenant reporting unless the user has platform-level authorization.
+- Separate configurable company policies, statutory settings, workflow rules, and branding by tenant.
+- Include backup, restore, and data-retention strategies that preserve tenant boundaries.
+
+## 12. Development Blueprint (Execution Plan)
+
+```text
+Phase 1: Software Design & Requirements
+  │
+  ▼
+Phase 2: UI/UX Design
+  │
+  ▼
+Phase 3: Database Design
+  │
+  ▼
+Phase 4: Authentication & Security
+  │
+  ▼
+Phase 5: Core HR Modules
+  │
+  ▼
+Phase 6: Payroll Engine
+  │
+  ▼
+Phase 7: Loan Management & Top-Up
+  │
+  ▼
+Phase 8: Employee Self-Service
+  │
+  ▼
+Phase 9: Reports & Analytics
+  │
+  ▼
+Phase 10: Testing, Deployment & Operations
+```
+
+## 13. Cross-Cutting Non-Functional Requirements
+
+- **Availability:** Design critical HR, payroll, approval, and reporting functions for high availability during business hours and payroll cycles.
+- **Scalability:** Support multiple tenants, growing employee counts, and high-volume payroll/reporting workloads.
+- **Observability:** Implement structured logging, metrics, tracing, and operational dashboards.
+- **Compliance:** Maintain auditability, privacy controls, retention policies, and configurable statutory rules per jurisdiction.
+- **Performance:** Optimize dashboard, payroll, loan ledger, and analytics queries with appropriate indexing and caching.
+- **Accessibility:** Build user interfaces that follow accessible design practices for forms, navigation, color contrast, and keyboard use.
+- **Disaster Recovery:** Define backup frequency, restore testing, recovery time objectives, and recovery point objectives.
 
EOF
)
