export const ZERMATT_DOCUMENT_TYPES = [
  ["CV_RESUME", "CV/Resume"],
  ["OFFER_APPOINTMENT", "Offer of Appointment Letter"],
  ["EMPLOYEE_PERSONAL_DATA", "Employee Personal Data"],
  ["CERTIFICATES", "SSCE Certificate/ND/HND/B. Sc/PGD/M. Sc/MBA"],
  ["GUARANTOR_1_2", "Guarantor 1 & 2"],
  ["NIN_SLIP", "NIN Slip"],
  ["PASSPORT_PHOTO", "Passport"],
];

export const ZERMATT_DOCUMENT_ITEMS = ZERMATT_DOCUMENT_TYPES.map(([, label]) => label);

export function isZermattOrganization(organization) {
  return String(organization?.slug || "").trim().toLowerCase() === "zermatt-liquor-limited";
}
