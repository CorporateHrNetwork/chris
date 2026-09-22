const ZERMATT_LOAN_POLICIES = Object.freeze([
  "Staff Loan",
  "Car Loan",
  "School Loan",
  "Accommodation Loan",
  "Building Project Loan",
  "Medical Support Loan",
  "Marriage Loan",
  "Education Loan",
]);

async function getOrganization(prismaClient, organizationId) {
  return prismaClient.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true, name: true },
  });
}

async function getLoanPolicies({ organizationId, prismaClient }) {
  const organization = await getOrganization(prismaClient, organizationId);

  if (organization?.slug === "zermatt-liquor-limited") {
    return {
      organization: organization.name,
      interestRatePercent: 0,
      interestBearing: false,
      policies: ZERMATT_LOAN_POLICIES.map((name) => ({
        code: name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, ""),
        name,
        interestRatePercent: 0,
      })),
      control: "ZERMATT employee loan policies are zero-interest. Loan purpose must be selected from the approved policy list in CHRiS.",
    };
  }

  return {
    organization: organization?.name || null,
    interestRatePercent: 0,
    interestBearing: false,
    policies: [],
    control: "No tenant-specific loan policy catalogue has been configured for this organization.",
  };
}

async function validateLoanPurpose({ organizationId, purpose, prismaClient }) {
  const organization = await getOrganization(prismaClient, organizationId);
  if (organization?.slug !== "zermatt-liquor-limited") return String(purpose || "").trim();

  const normalized = String(purpose || "").trim();
  if (!ZERMATT_LOAN_POLICIES.includes(normalized)) {
    const error = new Error("Select an approved ZERMATT loan policy.");
    error.code = "INVALID_ZERMATT_LOAN_POLICY";
    error.statusCode = 400;
    error.details = { allowedPolicies: ZERMATT_LOAN_POLICIES };
    throw error;
  }
  return normalized;
}

module.exports = {
  ZERMATT_LOAN_POLICIES,
  getLoanPolicies,
  validateLoanPurpose,
};
