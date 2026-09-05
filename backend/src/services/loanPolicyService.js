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

async function getLoanPolicies({ organizationId, prismaClient }) {
  const organization = await prismaClient.organization.findUnique({
    where: { id: organizationId },
    select: { slug: true, name: true },
  });

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
      control: "ZERMATT employee loan policies are zero-interest. Loan purpose must be selected from the approved policy list in the CHRiS user interface.",
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

module.exports = {
  ZERMATT_LOAN_POLICIES,
  getLoanPolicies,
};
