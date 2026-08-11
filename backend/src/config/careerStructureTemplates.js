const CAREER_STRUCTURE_TEMPLATES = [
  {
    key: "human-resources",
    name: "Human Resources",
    code: "HR",
    aliases: [
      "Human Resources",
      "HR",
      "People & Culture",
      "People Operations",
    ],
    careerTrack: "Human Resources",
    description:
      "General HR career progression covering entry support through departmental leadership.",
    positions: [
      {
        name: "HR Assistant",
        code: "HR-AST",
        level: 1,
      },
      {
        name: "HR Officer",
        code: "HR-OFF",
        level: 2,
      },
      {
        name: "Senior HR Officer",
        code: "HR-SNR",
        level: 3,
      },
      {
        name: "Human Resources Manager",
        code: "HR-MGR",
        level: 4,
      },
      {
        name: "Head of Human Resources",
        code: "HR-HOD",
        level: 5,
      },
    ],
  },

  {
    key: "finance",
    name: "Finance",
    code: "FIN",
    aliases: [
      "Finance",
      "Accounts & Finance",
      "Finance & Accounts",
      "Accounting",
    ],
    careerTrack: "Finance",
    description:
      "Finance progression from support roles through finance leadership.",
    positions: [
      {
        name: "Finance Assistant",
        code: "FIN-AST",
        level: 1,
      },
      {
        name: "Finance Officer",
        code: "FIN-OFF",
        level: 2,
      },
      {
        name: "Senior Finance Officer",
        code: "FIN-SNR",
        level: 3,
      },
      {
        name: "Finance Manager",
        code: "FIN-MGR",
        level: 4,
      },
      {
        name: "Head of Finance",
        code: "FIN-HOD",
        level: 5,
      },
    ],
  },

  {
    key: "payroll",
    name: "Payroll",
    code: "PAY",
    aliases: [
      "Payroll",
      "Payroll Administration",
    ],
    careerTrack: "Payroll",
    description:
      "Dedicated payroll progression for organizations that operate Payroll as a distinct function.",
    positions: [
      {
        name: "Payroll Assistant",
        code: "PAY-AST",
        level: 1,
      },
      {
        name: "Payroll Officer",
        code: "PAY-OFF",
        level: 2,
      },
      {
        name: "Senior Payroll Officer",
        code: "PAY-SNR",
        level: 3,
      },
      {
        name: "Payroll Supervisor",
        code: "PAY-SUP",
        level: 4,
      },
      {
        name: "Payroll Manager",
        code: "PAY-MGR",
        level: 5,
      },
      {
        name: "Head of Payroll",
        code: "PAY-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "operations",
    name: "Operations",
    code: "OPS",
    aliases: [
      "Operations",
      "Business Operations",
    ],
    careerTrack: "Operations",
    description:
      "General operational career progression from support through operational leadership.",
    positions: [
      {
        name: "Operations Assistant",
        code: "OPS-AST",
        level: 1,
      },
      {
        name: "Operations Officer",
        code: "OPS-OFF",
        level: 2,
      },
      {
        name: "Senior Operations Officer",
        code: "OPS-SNR",
        level: 3,
      },
      {
        name: "Operations Supervisor",
        code: "OPS-SUP",
        level: 4,
      },
      {
        name: "Operations Manager",
        code: "OPS-MGR",
        level: 5,
      },
      {
        name: "Head of Operations",
        code: "OPS-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "audit-internal-control",
    name: "Audit & Internal Control",
    code: "AUD",
    aliases: [
      "Audit",
      "Internal Audit",
      "Audit & Internal Control",
      "Internal Control",
    ],
    careerTrack: "Audit & Internal Control",
    description:
      "Audit and internal-control progression for assurance and governance functions.",
    positions: [
      {
        name: "Audit Assistant",
        code: "AUD-AST",
        level: 1,
      },
      {
        name: "Internal Audit Officer",
        code: "AUD-OFF",
        level: 2,
      },
      {
        name: "Senior Internal Audit Officer",
        code: "AUD-SNR",
        level: 3,
      },
      {
        name: "Internal Audit Manager",
        code: "AUD-MGR",
        level: 4,
      },
      {
        name: "Head of Internal Audit",
        code: "AUD-HOD",
        level: 5,
      },
    ],
  },

  {
    key: "supply-chain",
    name: "Supply Chain",
    code: "SCM",
    aliases: [
      "Supply Chain",
      "Supply Chain Management",
      "Supply Chains",
    ],
    careerTrack: "Supply Chain",
    description:
      "Supply-chain career progression covering planning, coordination and management.",
    positions: [
      {
        name: "Supply Chain Assistant",
        code: "SCM-AST",
        level: 1,
      },
      {
        name: "Supply Chain Officer",
        code: "SCM-OFF",
        level: 2,
      },
      {
        name: "Senior Supply Chain Officer",
        code: "SCM-SNR",
        level: 3,
      },
      {
        name: "Supply Chain Manager",
        code: "SCM-MGR",
        level: 4,
      },
      {
        name: "Head of Supply Chain",
        code: "SCM-HOD",
        level: 5,
      },
    ],
  },

  {
    key: "transport-logistics",
    name: "Transport & Logistics",
    code: "TLG",
    aliases: [
      "Transport & Logistics",
      "Logistics",
      "Transport",
      "Fleet & Logistics",
    ],
    careerTrack: "Transport & Logistics",
    description:
      "Transport, fleet and logistics progression from operational support to functional leadership.",
    positions: [
      {
        name: "Logistics Assistant",
        code: "TLG-AST",
        level: 1,
      },
      {
        name: "Logistics Officer",
        code: "TLG-OFF",
        level: 2,
      },
      {
        name: "Senior Logistics Officer",
        code: "TLG-SNR",
        level: 3,
      },
      {
        name: "Logistics Supervisor",
        code: "TLG-SUP",
        level: 4,
      },
      {
        name: "Logistics Manager",
        code: "TLG-MGR",
        level: 5,
      },
      {
        name: "Head of Logistics",
        code: "TLG-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "hse",
    name: "Health, Safety & Environment",
    code: "HSE",
    aliases: [
      "HSE",
      "Health Safety Environment",
      "Health, Safety & Environment",
      "Health & Safety",
    ],
    careerTrack: "HSE",
    description:
      "Health, Safety and Environment career progression.",
    positions: [
      {
        name: "HSE Assistant",
        code: "HSE-AST",
        level: 1,
      },
      {
        name: "HSE Officer",
        code: "HSE-OFF",
        level: 2,
      },
      {
        name: "Senior HSE Officer",
        code: "HSE-SNR",
        level: 3,
      },
      {
        name: "HSE Supervisor",
        code: "HSE-SUP",
        level: 4,
      },
      {
        name: "HSE Manager",
        code: "HSE-MGR",
        level: 5,
      },
      {
        name: "Head of HSE",
        code: "HSE-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "security",
    name: "Security",
    code: "SEC",
    aliases: [
      "Security",
      "Corporate Security",
      "Security Services",
    ],
    careerTrack: "Security",
    description:
      "Corporate-security progression from frontline positions through departmental leadership.",
    positions: [
      {
        name: "Security Officer",
        code: "SEC-OFF",
        level: 1,
      },
      {
        name: "Senior Security Officer",
        code: "SEC-SNR",
        level: 2,
      },
      {
        name: "Security Supervisor",
        code: "SEC-SUP",
        level: 3,
      },
      {
        name: "Security Coordinator",
        code: "SEC-COO",
        level: 4,
      },
      {
        name: "Security Manager",
        code: "SEC-MGR",
        level: 5,
      },
      {
        name: "Head of Security",
        code: "SEC-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "procurement-purchasing",
    name: "Procurement & Purchasing",
    code: "PPD",
    aliases: [
      "Procurement",
      "Purchasing",
      "Procurement & Purchasing",
      "Purchasing & Procurement",
    ],
    careerTrack: "Procurement",
    description:
      "Procurement and purchasing progression covering buying support through strategic leadership.",
    positions: [
      {
        name: "Procurement Assistant",
        code: "PPD-AST",
        level: 1,
      },
      {
        name: "Procurement Officer",
        code: "PPD-OFF",
        level: 2,
      },
      {
        name: "Senior Procurement Officer",
        code: "PPD-SNR",
        level: 3,
      },
      {
        name: "Procurement Supervisor",
        code: "PPD-SUP",
        level: 4,
      },
      {
        name: "Procurement Manager",
        code: "PPD-MGR",
        level: 5,
      },
      {
        name: "Head of Procurement",
        code: "PPD-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "warehouse-stores",
    name: "Warehouse & Stores",
    code: "WHS",
    aliases: [
      "Warehouse",
      "Stores",
      "Warehouse & Stores",
      "Warehouse & Store",
      "Stores & Warehouse",
    ],
    careerTrack: "Warehouse & Stores",
    description:
      "Warehouse and stores progression covering inventory operations through warehouse leadership.",
    positions: [
      {
        name: "Warehouse Assistant",
        code: "WHS-AST",
        level: 1,
      },
      {
        name: "Warehouse Officer",
        code: "WHS-OFF",
        level: 2,
      },
      {
        name: "Senior Warehouse Officer",
        code: "WHS-SNR",
        level: 3,
      },
      {
        name: "Warehouse Supervisor",
        code: "WHS-SUP",
        level: 4,
      },
      {
        name: "Warehouse Manager",
        code: "WHS-MGR",
        level: 5,
      },
      {
        name: "Head of Warehousing",
        code: "WHS-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "administration",
    name: "Administration",
    code: "ADM",
    aliases: [
      "Administration",
      "Admin",
      "Office Administration",
    ],
    careerTrack: "Administration",
    description:
      "General administration progression.",
    positions: [
      {
        name: "Administrative Assistant",
        code: "ADM-AST",
        level: 1,
      },
      {
        name: "Administrative Officer",
        code: "ADM-OFF",
        level: 2,
      },
      {
        name: "Senior Administrative Officer",
        code: "ADM-SNR",
        level: 3,
      },
      {
        name: "Administration Manager",
        code: "ADM-MGR",
        level: 4,
      },
      {
        name: "Head of Administration",
        code: "ADM-HOD",
        level: 5,
      },
    ],
  },

  {
    key: "legal-compliance",
    name: "Legal & Compliance",
    code: "LGC",
    aliases: [
      "Legal",
      "Compliance",
      "Legal & Compliance",
    ],
    careerTrack: "Legal & Compliance",
    description:
      "Legal and compliance progression.",
    positions: [
      {
        name: "Legal Assistant",
        code: "LGC-AST",
        level: 1,
      },
      {
        name: "Legal & Compliance Officer",
        code: "LGC-OFF",
        level: 2,
      },
      {
        name: "Senior Legal & Compliance Officer",
        code: "LGC-SNR",
        level: 3,
      },
      {
        name: "Legal & Compliance Manager",
        code: "LGC-MGR",
        level: 4,
      },
      {
        name: "Head of Legal & Compliance",
        code: "LGC-HOD",
        level: 5,
      },
    ],
  },

  {
    key: "information-technology",
    name: "Information Technology",
    code: "ICT",
    aliases: [
      "IT",
      "ICT",
      "Information Technology",
      "Information & Communication Technology",
    ],
    careerTrack: "Information Technology",
    description:
      "General IT/ICT career progression.",
    positions: [
      {
        name: "IT Support Assistant",
        code: "ICT-AST",
        level: 1,
      },
      {
        name: "IT Officer",
        code: "ICT-OFF",
        level: 2,
      },
      {
        name: "Senior IT Officer",
        code: "ICT-SNR",
        level: 3,
      },
      {
        name: "IT Manager",
        code: "ICT-MGR",
        level: 4,
      },
      {
        name: "Head of Information Technology",
        code: "ICT-HOD",
        level: 5,
      },
    ],
  },

  {
    key: "sales",
    name: "Sales",
    code: "SAL",
    aliases: [
      "Sales",
      "Commercial Sales",
    ],
    careerTrack: "Sales",
    description:
      "General sales career progression.",
    positions: [
      {
        name: "Sales Representative",
        code: "SAL-REP",
        level: 1,
      },
      {
        name: "Sales Executive",
        code: "SAL-EXE",
        level: 2,
      },
      {
        name: "Senior Sales Executive",
        code: "SAL-SNR",
        level: 3,
      },
      {
        name: "Sales Supervisor",
        code: "SAL-SUP",
        level: 4,
      },
      {
        name: "Sales Manager",
        code: "SAL-MGR",
        level: 5,
      },
      {
        name: "Head of Sales",
        code: "SAL-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "marketing",
    name: "Marketing",
    code: "MKT",
    aliases: [
      "Marketing",
      "Brand & Marketing",
    ],
    careerTrack: "Marketing",
    description:
      "Marketing career progression.",
    positions: [
      {
        name: "Marketing Assistant",
        code: "MKT-AST",
        level: 1,
      },
      {
        name: "Marketing Officer",
        code: "MKT-OFF",
        level: 2,
      },
      {
        name: "Senior Marketing Officer",
        code: "MKT-SNR",
        level: 3,
      },
      {
        name: "Marketing Manager",
        code: "MKT-MGR",
        level: 4,
      },
      {
        name: "Head of Marketing",
        code: "MKT-HOD",
        level: 5,
      },
    ],
  },

  {
    key: "customer-service",
    name: "Customer Service",
    code: "CUS",
    aliases: [
      "Customer Service",
      "Customer Experience",
      "Client Service",
    ],
    careerTrack: "Customer Service",
    description:
      "Customer-service and customer-experience career progression.",
    positions: [
      {
        name: "Customer Service Representative",
        code: "CUS-REP",
        level: 1,
      },
      {
        name: "Customer Service Officer",
        code: "CUS-OFF",
        level: 2,
      },
      {
        name: "Senior Customer Service Officer",
        code: "CUS-SNR",
        level: 3,
      },
      {
        name: "Customer Service Supervisor",
        code: "CUS-SUP",
        level: 4,
      },
      {
        name: "Customer Service Manager",
        code: "CUS-MGR",
        level: 5,
      },
      {
        name: "Head of Customer Experience",
        code: "CUS-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "quality-assurance",
    name: "Quality Assurance",
    code: "QAS",
    aliases: [
      "Quality Assurance",
      "Quality Control",
      "Quality",
    ],
    careerTrack: "Quality Assurance",
    description:
      "Quality assurance and control progression.",
    positions: [
      {
        name: "Quality Assistant",
        code: "QAS-AST",
        level: 1,
      },
      {
        name: "Quality Assurance Officer",
        code: "QAS-OFF",
        level: 2,
      },
      {
        name: "Senior Quality Assurance Officer",
        code: "QAS-SNR",
        level: 3,
      },
      {
        name: "Quality Supervisor",
        code: "QAS-SUP",
        level: 4,
      },
      {
        name: "Quality Manager",
        code: "QAS-MGR",
        level: 5,
      },
      {
        name: "Head of Quality",
        code: "QAS-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "maintenance-engineering",
    name: "Maintenance & Engineering",
    code: "ENG",
    aliases: [
      "Engineering",
      "Maintenance",
      "Maintenance & Engineering",
      "Technical Services",
    ],
    careerTrack: "Maintenance & Engineering",
    description:
      "Technical, maintenance and engineering progression.",
    positions: [
      {
        name: "Technical Assistant",
        code: "ENG-AST",
        level: 1,
      },
      {
        name: "Maintenance Officer",
        code: "ENG-OFF",
        level: 2,
      },
      {
        name: "Senior Maintenance Officer",
        code: "ENG-SNR",
        level: 3,
      },
      {
        name: "Maintenance Supervisor",
        code: "ENG-SUP",
        level: 4,
      },
      {
        name: "Engineering Manager",
        code: "ENG-MGR",
        level: 5,
      },
      {
        name: "Head of Engineering",
        code: "ENG-HOD",
        level: 6,
      },
    ],
  },

  {
    key: "projects",
    name: "Projects",
    code: "PRJ",
    aliases: [
      "Projects",
      "Project Management",
      "PMO",
    ],
    careerTrack: "Projects",
    description:
      "Project-management career progression.",
    positions: [
      {
        name: "Project Assistant",
        code: "PRJ-AST",
        level: 1,
      },
      {
        name: "Project Officer",
        code: "PRJ-OFF",
        level: 2,
      },
      {
        name: "Senior Project Officer",
        code: "PRJ-SNR",
        level: 3,
      },
      {
        name: "Project Manager",
        code: "PRJ-MGR",
        level: 4,
      },
      {
        name: "Senior Project Manager",
        code: "PRJ-SRM",
        level: 5,
      },
      {
        name: "Head of Projects",
        code: "PRJ-HOD",
        level: 6,
      },
    ],
  },
];


function getCareerStructureTemplate(
  templateKey
) {
  return (
    CAREER_STRUCTURE_TEMPLATES.find(
      (template) =>
        template.key ===
        templateKey
    ) ||
    null
  );
}


module.exports = {
  CAREER_STRUCTURE_TEMPLATES,
  getCareerStructureTemplate,
};