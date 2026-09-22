const hasText = (value) => Boolean(String(value || "").trim());
const completeStatus = (value) => ["Completed", "Not Applicable"].includes(String(value || "").trim());

const REQUIREMENTS = {
  "personal-details": [
    ["fullName", "Full Name", (data) => hasText(data.fullName)],
    ["phone", "Phone Number", (data) => hasText(data.phone)],
    ["email", "Email Address", (data) => hasText(data.email)],
    ["gender", "Gender", (data) => data.gender && data.gender !== "UNSPECIFIED"],
    ["dateOfBirth", "Date of Birth", (data) => hasText(data.dateOfBirth)],
    ["maritalStatus", "Marital Status", (data) => hasText(data.maritalStatus)],
    ["nationality", "Nationality", (data) => hasText(data.nationality)],
    ["residentialAddress", "Residential Address", (data) => hasText(data.residentialAddress)],
    ["idType", "ID Type", (data) => hasText(data.idType)],
    ["idNumber", "ID Number", (data) => hasText(data.idNumber)],
  ],
  "statutory-details": [
    ["taxIdentificationNumber", "Tax Identification Number (TIN)", (data) => hasText(data.taxIdentificationNumber)],
    ["payeState", "PAYE State / Tax Authority", (data) => hasText(data.payeState)],
    ["pensionPfa", "Pension Fund Administrator (PFA)", (data) => hasText(data.pensionPfa)],
    ["pensionPin", "Retirement Savings Account (RSA) PIN", (data) => hasText(data.pensionPin)],
    ["nhiaNumber", "NHIA / Health Insurance Number", (data) => hasText(data.nhiaNumber)],
    ["otherStatutoryStatus", "Other Statutory Requirements", (data) => completeStatus(data.otherStatutoryStatus)],
  ],
  "payment-details": [
    ["bankName", "Bank Name", (data) => hasText(data.bankName)],
    ["accountName", "Account Name", (data) => hasText(data.accountName)],
    ["accountNumber", "Account Number", (data) => hasText(data.accountNumber)],
    ["payrollCurrency", "Payroll Currency", (data) => hasText(data.payrollCurrency)],
    ["paymentMethod", "Payment Method", (data) => hasText(data.paymentMethod)],
  ],
  "next-of-kin": [
    ["name", "Next of Kin Name", (data) => hasText(data.name)],
    ["relationship", "Relationship", (data) => hasText(data.relationship)],
    ["phoneNumber", "Phone Number", (data) => hasText(data.phoneNumber)],
    ["address", "Residential Address", (data) => hasText(data.address)],
  ],
  "emergency-contact": [
    ["name", "Emergency Contact Name", (data) => hasText(data.name)],
    ["relationship", "Relationship", (data) => hasText(data.relationship)],
    ["phoneNumber", "Phone Number", (data) => hasText(data.phoneNumber)],
  ],
  legal: [
    ["employmentContractStatus", "Employment Contract", (data) => completeStatus(data.employmentContractStatus)],
    ["ndaStatus", "Confidentiality / NDA", (data) => completeStatus(data.ndaStatus)],
    ["policyAcknowledgementStatus", "Policy Acknowledgements", (data) => completeStatus(data.policyAcknowledgementStatus)],
    ["dataPrivacyConsentStatus", "Data Privacy Consent", (data) => completeStatus(data.dataPrivacyConsentStatus)],
  ],
};

function validateOnboardingSection(sectionKey, data = {}) {
  const requirements = REQUIREMENTS[sectionKey] || [];
  const fields = requirements
    .filter(([, , complete]) => !complete(data))
    .map(([field, label]) => ({
      field,
      label,
      message: `${label} is required to complete this onboarding section.`,
    }));
  return { valid: fields.length === 0, fields };
}

module.exports = { REQUIREMENTS, validateOnboardingSection };
