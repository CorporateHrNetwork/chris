const { ZERMATT_DESIGNATION_LEVELS, ZERMATT_EMPLOYMENT_LEVELS } = require("../config/zermattEmploymentLevels");
const { getZermattSopLibrary } = require("./zermattSopResourceService");

const LEGAL_RESOURCES = [
  {
    id: "labour-act",
    title: "Nigerian Labour Act — HR Operational Guide",
    category: "LAW",
    authority: "Federal Ministry of Labour and Employment",
    sourceUrl: "https://www.labour.gov.ng/resources/",
    reviewNote: "Operational summary only. Check the current official text and legal advice before relying on a statutory interpretation.",
    sections: [
      ["Purpose", "Core reference for contracts of employment, wages, worker protections and labour administration in Nigeria."],
      ["HR controls", "Issue written employment terms; keep accurate employee and wage records; document lawful deductions; maintain fair disciplinary, grievance and exit processes; escalate statutory interpretation to qualified counsel."],
      ["CHRiS evidence", "Employment offer/contract, employee profile, compensation authority, attendance, leave, disciplinary records, notices, acknowledgements and exit documentation should remain date-stamped and auditable."],
    ],
  },
  {
    id: "tax-laws",
    title: "Nigeria Personal Income Tax / PAYE — Employer Guide",
    category: "TAX",
    authority: "Joint Revenue Board / Nigeria Revenue Service / relevant State Internal Revenue Service",
    sourceUrl: "https://www.jtb.gov.ng/media-center/jrb-releases-pit-guidelines-2026",
    reviewNote: "Use the current tax-year rules configured in CHRiS. Tax law and rates are effective-dated and must not be hard-coded from an obsolete year.",
    sections: [
      ["2026 framework", "Personal income tax administration changed under Nigeria's 2025 tax reform laws; employers should use the current JRB Personal Income Tax Guidelines and the applicable State tax authority requirements."],
      ["Payroll control", "Calculate PAYE from the active effective-dated payroll policy, preserve employee tax identifiers and relief evidence, reconcile deductions to approved payroll, and retain remittance evidence."],
      ["Zermatt rule", "Zermatt Leave Allowance is configured as an after-tax, non-taxable company benefit in CHRiS and must not increase PAYE chargeable income."],
    ],
  },
  {
    id: "pension-reform-act",
    title: "Pension Reform Act 2014 — Employer Guide",
    category: "PENSION",
    authority: "National Pension Commission (PenCom)",
    sourceUrl: "https://www.pencom.gov.ng/pra2014/",
    reviewNote: "Apply current PenCom rules, exemptions and guidance. Confirm contribution basis and employee applicability before payroll activation.",
    sections: [
      ["Core rule", "The Contributory Pension Scheme applies to covered private-sector employment. Under PRA 2014, the statutory minimum contribution rates are 10% employer and 8% employee of the applicable monthly emoluments, subject to the Act and current PenCom guidance."],
      ["Employer controls", "Collect and validate RSA/PFA information, calculate the correct contribution basis, reconcile payroll deductions and employer contributions, remit through the prescribed pension process, and retain schedules/evidence."],
      ["Insurance", "Maintain the required Group Life Insurance control for covered employees and retain policy/coverage evidence."],
    ],
  },
  {
    id: "minimum-wage",
    title: "National Minimum Wage — Compliance Note",
    category: "LAW",
    authority: "Federal Government / Federal Ministry of Labour and Employment",
    sourceUrl: "https://www.labour.gov.ng/resources/",
    reviewNote: "Confirm current statutory amount, coverage and exemptions for each worker category before relying on this summary.",
    sections: [["Control", "Salary-rate approvals and payroll readiness should flag any covered employee whose authorized pay falls below the current applicable national minimum wage."]],
  },
  {
    id: "employees-compensation",
    title: "Employees’ Compensation Act 2010 / NSITF — Employer Guide",
    category: "SOCIAL_INSURANCE",
    authority: "Nigeria Social Insurance Trust Fund (NSITF)",
    sourceUrl: "https://nsitf.gov.ng/compensation/",
    reviewNote: "Report and manage workplace injury, occupational disease and compensation cases under the current NSITF process.",
    sections: [["HR controls", "Maintain employee coverage records, workplace incident reports, medical/evidence files, statutory notifications, return-to-work records and compensation case tracking."]],
  },
  {
    id: "data-protection",
    title: "Nigeria Data Protection Act 2023 — Employee Data Guide",
    category: "PRIVACY",
    authority: "Nigeria Data Protection Commission (NDPC)",
    sourceUrl: "https://www.ndpc.gov.ng/ndp-act-2023/",
    reviewNote: "Employee information must be processed under a valid lawful basis with proportionate access, retention and security controls.",
    sections: [["CHRiS controls", "Use tenant isolation, role-based access, audit trails, minimum-necessary access, secure attachments, controlled exports, documented retention and incident escalation for employee personal data."]],
  },
  {
    id: "osh",
    title: "Occupational Safety & Health — Workplace Guide",
    category: "SAFETY",
    authority: "Federal Ministry of Labour and Employment",
    sourceUrl: "https://www.labour.gov.ng/policies-and-regulations/",
    reviewNote: "Apply the current National Policy on Occupational Safety and Health and any industry/site-specific requirements.",
    sections: [["Zermatt controls", "Induct employees on hazards, emergency response, fire safety, manual handling, security, incident reporting, alcohol-service/stock-area risks, PPE where required, and safe equipment use."]],
  },
];

const EMPLOYMENT_POLICY = {
  id: "zermatt-employment-policy",
  title: "Zermatt Liquor Limited Employment Policy & Employee Handbook",
  category: "POLICY",
  version: "1.0-draft-for-management-approval",
  sections: [
    ["1. Purpose & scope", "Sets minimum employment standards for Zermatt employees across Head Office, branches, Beer Barn, retail, warehouse, logistics and support functions. Statutory law prevails where it grants a mandatory right or obligation."],
    ["2. Employment categories", "Employment status, type, designation, employment level, location, manager and cost centre are authoritative CHRiS records. Changes require approved, effective-dated HR action."],
    ["3. Recruitment & appointment", "Selection should be merit-based and documented. Every employee receives an approved offer/appointment record, role description and onboarding requirements before or at commencement."],
    ["4. Probation & confirmation", "Probation expectations, reviews and confirmation decisions must be documented. Extensions require written reasons and a revised review date."],
    ["5. Attendance & working time", "Employees must comply with assigned schedules, clocking/manual attendance controls, punctuality and absence-notification rules. Payroll inputs must remain auditable."],
    ["6. Compensation & payroll", "Pay is based on authorized salary rates and approved payroll. Unauthorized deductions or off-system pay changes are prohibited. Payroll corrections follow the controlled reopen/recalculate/approve workflow."],
    ["7. Leave", "Leave is administered through approved policy, entitlement, request, approval, commencement and return-to-work records. Employees must complete required handover/replacement arrangements before proceeding on leave where applicable."],
    ["8. Leave Allowance", "Eligible Zermatt employees receive Leave Allowance under the approved company formula and eligibility rule configured in CHRiS. It is treated by Zermatt as an after-tax, non-taxable benefit and shown separately from taxable salary."],
    ["9. Pension & statutory obligations", "Applicable deductions and employer obligations are processed using current effective-dated statutory rules. HR/Payroll must retain reconciliation and remittance evidence."],
    ["10. Conduct & ethics", "Employees must act honestly, protect company assets/stock/cash, avoid conflicts of interest, comply with lawful instructions, prevent theft/fraud and follow branch operating controls."],
    ["11. Respectful workplace", "Harassment, bullying, discrimination, retaliation and violence are prohibited. Complaints should be reported promptly and handled confidentially, fairly and without retaliation."],
    ["12. Alcohol, stock & cash controls", "Employees must follow authorization, stock movement, cash handling, sale, consumption, wastage, variance and security controls. Company products/assets may not be removed or consumed without authorization."],
    ["13. Health, safety & security", "Employees must follow safety procedures, report hazards/incidents, cooperate with investigations, use required protective equipment and comply with emergency/security instructions."],
    ["14. Confidentiality, privacy & systems", "Business, customer, employee and commercial information must be protected. Access to CHRiS and other systems is personal, role-based and auditable; credentials must not be shared."],
    ["15. Performance management", "Performance concerns should ordinarily progress through documented coaching, expectations, review, warning/PIP where appropriate, employee response and a reasoned decision consistent with policy and law."],
    ["16. Discipline & grievance", "Allegations must be documented, investigated fairly, communicated to the employee, and the employee must have a reasonable opportunity to respond before a disciplinary decision is made."],
    ["17. Training & development", "Mandatory and role-specific training, succession actions and development interventions should be recorded in CHRiS with attendance and evaluation evidence."],
    ["18. Transfers & promotions", "Transfers, promotions and reporting-line changes require approved effective dates and must update the employee's authoritative organizational records without rewriting history."],
    ["19. Separation & clearance", "Resignation, termination, retirement, redundancy and other exits require documented authority, final-pay review, asset/stock/cash clearance, access revocation, handover and retention of the exit record."],
    ["20. Policy governance", "HR owns this policy; management approval is required before issue. Legal/statutory sections must be reviewed when Nigerian employment, tax, pension, privacy or safety requirements change."],
  ],
};

const ONBOARDING_MATERIALS = [
  ["Welcome Pack", "Company overview; values; organizational structure; branch contacts; HR contacts; first-week expectations; policy links; benefits overview."],
  ["Pre-boarding Checklist", "Approved offer; identity/contact details; bank data; statutory IDs; emergency contact; role/designation; level; location; manager; cost centre; start date; work tools; system access; induction schedule."],
  ["Day 1 Induction Agenda", "Welcome; employment terms; handbook; payroll; leave; attendance; conduct; health/safety; security; privacy/IT; role introduction; branch tour; manager handoff; acknowledgements."],
  ["First Week Checklist", "Role objectives; SOPs; team introductions; required systems; stock/cash/security rules where relevant; training plan; first check-in."],
  ["30/60/90 Day Plan", "30 days: learn role and controls. 60 days: demonstrate independent delivery. 90 days: meet agreed performance/behavior standards and close probation gaps."],
  ["Manager Onboarding Checklist", "Confirm workstation/tools; introduce team; explain KPIs; assign buddy; review JD; set probation objectives; schedule check-ins; document training and concerns."],
  ["Payroll & Benefits Orientation", "Salary authority; pay cycle; statutory deductions; pension; leave allowance; loans/salary advances; payslips; correction process; employee responsibility for accurate records."],
  ["Leave & Attendance Orientation", "Work schedule; clocking/manual controls; lateness/absence; leave entitlement; request/approval; handover/replacement; return-to-work."],
  ["Health, Safety & Security Induction", "Emergency exits; fire response; incident reporting; prohibited conduct; safe manual handling; branch-specific hazards; security escalation."],
  ["Data Privacy & IT Security Induction", "Acceptable use; password/MFA hygiene; phishing; employee/customer confidentiality; authorized access; reporting suspected incidents."],
  ["Probation Review Form", "Objectives; achievements; attendance/conduct; capability gaps; training/coaching; employee comments; manager recommendation; HR review; confirmation/extension decision."],
];

const HR_TEMPLATES = [
  ["Employment Offer Letter", "Candidate name; role; location; reporting line; start date; employment type; probation; compensation; benefits; conditions precedent; acceptance/signatures."],
  ["Appointment / Employment Contract", "Parties; role; commencement; place of work; hours; remuneration; statutory deductions; leave; confidentiality; conduct; discipline; termination; property; data protection; governing law; signatures. Legal review required before issue."],
  ["Confirmation Letter", "Employee details; effective confirmation date; role/location; continuity of existing terms; signature/acknowledgement."],
  ["Probation Extension Letter", "Original review date; documented gaps; support/actions; revised objectives; new review date; consequence of non-improvement; acknowledgement."],
  ["Promotion Letter", "Old/new designation and level; effective date; salary change if any; reporting line; location/cost centre; acceptance."],
  ["Transfer Letter", "Current/new location/department/reporting line; effective date; handover; relocation terms if applicable; acknowledgement."],
  ["Salary Review Letter", "Current/revised salary authority; effective date; whether benefits change; payroll effective period; approval."],
  ["Query / Explanation Request", "Specific allegation/facts; date/time/location; policy/control involved; evidence reference; response deadline; fair-hearing statement; issuer."],
  ["Written Warning", "Finding; employee response considered; required standard; corrective action; monitoring period; consequence; acknowledgement."],
  ["Final Warning", "Prior interventions; final finding; exact improvement/behavior standard; review period; consequence; acknowledgement."],
  ["Performance Improvement Plan", "Performance gap; evidence/baseline; expected standard; actions/support; KPIs; check-in dates; employee response; outcome rules."],
  ["Disciplinary Hearing Invitation", "Allegation; hearing date/place; evidence/access; right to respond; permitted companion/representation where policy applies; non-prejudgment statement."],
  ["Disciplinary Outcome", "Allegation; evidence; response; findings; policy basis; decision; effective date; appeal/review path if applicable."],
  ["Leave Approval & Handover", "Leave type; dates/days; balance; replacement/handover person; outstanding tasks; return date; approvals."],
  ["Return-to-Work / Leave Resumption", "Actual return date; leave completed/early return; fitness/return document where required; work handback; status restoration."],
  ["Resignation Acknowledgement", "Notice receipt; proposed last day; notice treatment; handover; clearance; final pay; assets; access revocation."],
  ["Termination Letter", "Approved reason and process record; effective date; notice/payment treatment; final pay; clearance; return of property; confidentiality. Legal/HR review required before issue."],
  ["Redundancy / Restructuring Letter", "Business rationale; consultation/process record; affected role; effective date; statutory/contractual payments; clearance. Legal review required."],
  ["Exit Clearance", "Department handover; stock/cash; loans/advances; devices/assets; uniforms/keys; documents; system access; final-pay authorization."],
  ["Employment Verification / Reference", "Employee identity; role; dates of employment; factual status; authorized disclosure and signatory."],
  ["Employee Biodata & Emergency Contact", "Identity/contact; address; next of kin/emergency contact; relationship; phone; privacy notice/acknowledgement."],
  ["Employee HR File Checklist", "Offer/contract; identity; qualifications; bank/statutory data; emergency contact; JD; induction; policies; payroll authority; performance; training; discipline; leave; changes; exit."],
  ["Policy Acknowledgement", "Policy title/version; employee confirmation of receipt/read/understanding; questions route; signature/date."],
  ["Confidentiality & Acceptable Use Acknowledgement", "Information handling; systems; passwords; devices; records; prohibited disclosure; incident reporting; signature."],
  ["Asset Issue / Return Form", "Asset ID/description/condition; issue date; custodian; return date/condition; variance/damage; approvals."],
  ["Induction Attendance & Sign-off", "Topics; facilitators; date; employee attendance; acknowledgements; outstanding actions."],
  ["Training Attendance & Evaluation", "Programme; objectives; participants; attendance; pre/post assessment; feedback; line-manager follow-up."],
  ["Handover Checklist", "Responsibilities; open tasks; documents; passwords/access transfer through approved IT process; cash/stock/assets; risks; successor/replacement acknowledgement."],
];

const TRACK_RESPONSIBILITIES = {
  EXECUTIVE_MANAGEMENT: ["Set enterprise strategy and performance priorities", "Approve material policies, budgets and controls", "Ensure governance, risk and statutory compliance", "Lead senior management and organizational capability", "Protect enterprise reputation, assets and stakeholder interests"],
  HUMAN_RESOURCES: ["Deliver workforce planning and employee lifecycle operations", "Maintain accurate, auditable employee records", "Administer performance, employee relations and policy controls", "Support managers on lawful and consistent people decisions", "Produce workforce insights and compliance evidence"],
  HUMAN_RESOURCES_SPECIALIST: ["Own specialist HR processes and service standards", "Maintain accurate specialist records and controls", "Provide employee/manager guidance within policy", "Track exceptions, KPIs and required follow-up", "Support audit-ready HR documentation"],
  FINANCE: ["Maintain accurate financial and payroll-related records", "Reconcile cash, accounts and supporting schedules", "Apply authorization and segregation-of-duty controls", "Escalate variances and control breaches", "Support timely management and statutory reporting"],
  AUDIT_INTERNAL_CONTROL: ["Test compliance with approved controls", "Investigate and document exceptions objectively", "Track remediation actions", "Protect audit independence and evidence integrity", "Report material control risks to authorized management"],
  BEER_BARN_OPERATIONS: ["Deliver safe, efficient floor and service operations", "Coordinate staffing, service standards and shift controls", "Control stock, cash, wastage and operational handovers", "Resolve guest/service issues within authority", "Enforce safety, conduct and branch procedures"],
  BEER_BARN_BAR: ["Prepare and serve authorized beverages to standard", "Protect bar stock, measures, cash and equipment", "Maintain hygiene and workstation readiness", "Follow responsible-service and security controls", "Record variances, wastage and incidents promptly"],
  BEER_BARN_KITCHEN: ["Prepare food safely and consistently", "Maintain hygiene, temperature and storage controls", "Control ingredients, portions and wastage", "Keep kitchen/equipment clean and serviceable", "Follow shift handover and safety procedures"],
  BEER_BARN_SERVICE: ["Provide timely, courteous guest service", "Accurately capture and deliver orders", "Protect company stock/equipment and report variances", "Maintain service-area cleanliness and readiness", "Escalate guest, safety and security issues appropriately"],
  BB_TAKEAWAY: ["Process takeaway orders accurately and promptly", "Maintain product, cash and packaging controls", "Protect hygiene and presentation standards", "Reconcile shift activity and variances", "Follow customer-service and security procedures"],
  ZERMATT_OPERATIONS: ["Run branch/floor operations to approved standards", "Coordinate staffing, sales and service execution", "Protect stock, cash, assets and operational records", "Monitor KPIs, incidents and exceptions", "Enforce branch, safety and security controls"],
  ZERMATT_SALES: ["Deliver sales and customer-service targets ethically", "Maintain accurate product and transaction records", "Protect stock, cash and point-of-sale controls", "Support merchandising and product availability", "Escalate customer, stock and system exceptions"],
  SUPPLY_CHAIN: ["Plan and execute authorized purchasing, stores, inventory or logistics activity", "Maintain complete movement and source documents", "Protect stock from loss, damage and unauthorized movement", "Reconcile inventory and investigate variances", "Apply vendor, approval and segregation-of-duty controls"],
  SECURITY: ["Protect people, premises, stock, cash and assets", "Control access and patrol assigned areas", "Respond to incidents proportionately and escalate promptly", "Maintain incident/visitor/security records", "Support emergency and investigation procedures"],
  SECURITY_CROWD_CONTROL: ["Maintain safe entry, crowd and venue order", "Apply access rules consistently and professionally", "De-escalate conflict and summon support when required", "Protect guests, employees and assets", "Document significant incidents"],
  SECURITY_TRAFFIC_CONTROL: ["Direct vehicle and pedestrian movement safely", "Maintain access/parking controls", "Prevent obstruction and unsafe driving in controlled areas", "Escalate incidents and security concerns", "Support peak-period traffic plans"],
  HOUSEKEEPING_FACILITIES: ["Maintain clean, safe and serviceable premises", "Complete assigned cleaning/maintenance schedules", "Report defects and hazards promptly", "Protect tools, consumables and company property", "Maintain completion and maintenance records"],
  DOMESTIC_SUPPORT: ["Maintain assigned domestic areas to required hygiene standards", "Protect household/company property and supplies", "Follow schedules and lawful instructions", "Report defects, hazards and incidents", "Maintain discretion and confidentiality"],
  ENTERTAINMENT: ["Deliver approved entertainment programming professionally", "Coordinate timing, audience experience and venue requirements", "Protect equipment and content controls", "Follow safety, conduct and noise/event rules", "Escalate technical or security issues"],
  ENTERTAINMENT_DJ: ["Deliver scheduled music programming to approved standards", "Prepare and protect music/equipment setup", "Coordinate cues with operations and entertainment teams", "Observe content, conduct and venue controls", "Report equipment or safety issues"],
  ENTERTAINMENT_TECH: ["Operate and maintain audio/visual systems safely", "Prepare equipment before events/shifts", "Troubleshoot faults and document repairs", "Protect technical assets and cabling", "Coordinate technical requirements with operations"],
  ICT: ["Maintain reliable and secure business technology services", "Administer authorized users, devices, networks and systems", "Protect data, backups and access controls", "Resolve incidents and document changes", "Escalate cybersecurity risks and material outages"],
  EXECUTIVE_SUPPORT: ["Manage executive schedules, correspondence and confidential records", "Coordinate meetings, travel and follow-up actions", "Prepare accurate briefs and documents", "Protect sensitive information", "Track delegated actions to completion"],
  CORPORATE_GOVERNANCE: ["Support corporate governance and statutory records", "Maintain board/company secretarial documentation", "Track resolutions, filings and governance actions", "Protect confidential corporate records", "Advise authorized leadership on governance process"],
};

function titleCaseTrack(track) {
  return String(track || "GENERAL").replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function levelRecord(levelNumber) {
  return ZERMATT_EMPLOYMENT_LEVELS.find((item) => item.levelNumber === levelNumber) || null;
}

function makeJobDescription(role) {
  const level = levelRecord(role.levelNumber);
  const baseResponsibilities = TRACK_RESPONSIBILITIES[role.careerTrack] || [
    "Deliver assigned responsibilities to approved standards",
    "Maintain accurate records and comply with company controls",
    "Protect company assets and confidential information",
    "Escalate risks, incidents and exceptions promptly",
    "Support team and business objectives",
  ];
  const leadership = role.levelNumber >= 8
    ? ["Lead planning, resource allocation, performance and control effectiveness for the assigned function."]
    : role.levelNumber >= 4
      ? ["Coordinate assigned colleagues/shift activity and escalate unresolved operating issues."]
      : [];
  return {
    id: role.code,
    jobTitle: role.name,
    designationCode: role.code,
    careerTrack: role.careerTrack,
    function: titleCaseTrack(role.careerTrack),
    employmentLevel: level ? `${level.code} — ${level.name}` : `L${role.levelNumber}`,
    reportsTo: role.levelNumber >= 11 ? "Board / Ownership as applicable" : "Assigned Line Manager under the approved Zermatt reporting structure",
    locationScope: "As assigned in CHRiS (Head Office / Branch / Operational Site)",
    rolePurpose: `To deliver ${role.name} responsibilities within Zermatt Liquor Limited's approved operating, customer-service, financial, people, safety and control framework.`,
    responsibilities: [...leadership, ...baseResponsibilities],
    kpis: ["Quality/accuracy of role outputs", "Timeliness and service delivery", "Compliance/control exceptions", "Attendance and reliability", "Role-specific productivity, sales, cost, stock, service or risk measures as applicable"],
    qualifications: role.levelNumber >= 9 ? "Relevant degree/professional qualification or equivalent demonstrable experience; substantial role and people-management experience." : role.levelNumber >= 6 ? "Relevant diploma/degree/professional training or equivalent practical experience appropriate to the role." : "Relevant education, trade/service training or demonstrable practical competence appropriate to the role.",
    competencies: ["Integrity and accountability", "Role/technical competence", "Communication and teamwork", "Customer/business awareness", "Safety and control discipline"],
    compliance: ["Comply with Zermatt Employment Policy, Code of Conduct and applicable SOPs", "Maintain required records and audit evidence", "Protect confidential, employee, customer and business data", "Report suspected fraud, theft, harassment, safety incidents or control breaches promptly"],
    documentStatus: "Management review / role-holder validation required before final issue",
  };
}

function getZermattEmploymentResourceLibrary() {
  const sopLibrary = getZermattSopLibrary();
  return {
    generatedAt: new Date().toISOString(),
    tenant: "zermatt-liquor-limited",
    disclaimer: "This library combines Zermatt HR working documents with plain-language compliance guidance. Statutory summaries are not a substitute for the official law, regulator guidance or legal advice. Management must approve company policies/templates/SOPs before issue.",
    legalResources: LEGAL_RESOURCES,
    employmentPolicy: EMPLOYMENT_POLICY,
    employmentOfferTemplate: {
      title: "Zermatt Employment Offer Template",
      body: [
        "Dear {{Candidate Name}},",
        "We are pleased to offer you employment with Zermatt Liquor Limited as {{Designation}}, assigned to {{Location/Branch}}, reporting to {{Line Manager / Role}}.",
        "Your proposed commencement date is {{Start Date}} and your employment type is {{Employment Type}}. Your employment will be subject to the approved probation terms stated in your appointment documentation.",
        "Your authorized monthly gross salary is NGN {{Gross Salary}}, subject to applicable statutory deductions and approved company benefit rules. Any additional benefit must be expressly stated in writing or configured under an approved Zermatt benefit policy.",
        "This offer is conditional upon satisfactory verification of the information/documents requested by HR and your acceptance of Zermatt's Employment Policy, Code of Conduct, confidentiality, data-protection, safety and operational requirements.",
        "Please sign and return this offer by {{Acceptance Deadline}}. A detailed appointment/employment agreement and job description will form part of your employment documentation.",
        "For Zermatt Liquor Limited: {{Authorized Signatory / Title / Date}}",
        "Accepted by Employee: {{Name / Signature / Date}}",
      ],
    },
    onboardingMaterials: ONBOARDING_MATERIALS.map(([title, content], index) => ({ id: `onboarding-${index + 1}`, title, content })),
    hrTemplates: HR_TEMPLATES.map(([title, content], index) => ({ id: `template-${index + 1}`, title, content })),
    standardOperatingProcedures: sopLibrary.sops,
    sopCategories: sopLibrary.categories,
    sopStatus: sopLibrary.status,
    jobDescriptions: ZERMATT_DESIGNATION_LEVELS.map(makeJobDescription),
    summary: {
      legalResources: LEGAL_RESOURCES.length,
      onboardingMaterials: ONBOARDING_MATERIALS.length,
      hrTemplates: HR_TEMPLATES.length,
      standardOperatingProcedures: sopLibrary.sops.length,
      jobDescriptions: ZERMATT_DESIGNATION_LEVELS.length,
    },
  };
}

module.exports = { getZermattEmploymentResourceLibrary, makeJobDescription };