export const COUNTRY_CATALOG = [
  { code: "NG", name: "Nigeria", nationality: "Nigerian", dialCode: "+234" },
  { code: "GH", name: "Ghana", nationality: "Ghanaian", dialCode: "+233" },
  { code: "GB", name: "United Kingdom", nationality: "British", dialCode: "+44" },
  { code: "US", name: "United States", nationality: "American", dialCode: "+1" },
  { code: "CA", name: "Canada", nationality: "Canadian", dialCode: "+1" },
  { code: "ZA", name: "South Africa", nationality: "South African", dialCode: "+27" },
  { code: "KE", name: "Kenya", nationality: "Kenyan", dialCode: "+254" },
  { code: "UG", name: "Uganda", nationality: "Ugandan", dialCode: "+256" },
  { code: "RW", name: "Rwanda", nationality: "Rwandan", dialCode: "+250" },
  { code: "TZ", name: "Tanzania", nationality: "Tanzanian", dialCode: "+255" },
  { code: "CM", name: "Cameroon", nationality: "Cameroonian", dialCode: "+237" },
  { code: "CI", name: "Cote d'Ivoire", nationality: "Ivorian", dialCode: "+225" },
  { code: "SN", name: "Senegal", nationality: "Senegalese", dialCode: "+221" },
  { code: "SL", name: "Sierra Leone", nationality: "Sierra Leonean", dialCode: "+232" },
  { code: "LR", name: "Liberia", nationality: "Liberian", dialCode: "+231" },
  { code: "GM", name: "Gambia", nationality: "Gambian", dialCode: "+220" },
  { code: "AE", name: "United Arab Emirates", nationality: "Emirati", dialCode: "+971" },
  { code: "SA", name: "Saudi Arabia", nationality: "Saudi", dialCode: "+966" },
  { code: "IN", name: "India", nationality: "Indian", dialCode: "+91" },
  { code: "CN", name: "China", nationality: "Chinese", dialCode: "+86" },
  { code: "JP", name: "Japan", nationality: "Japanese", dialCode: "+81" },
  { code: "DE", name: "Germany", nationality: "German", dialCode: "+49" },
  { code: "FR", name: "France", nationality: "French", dialCode: "+33" },
  { code: "NL", name: "Netherlands", nationality: "Dutch", dialCode: "+31" },
  { code: "IE", name: "Ireland", nationality: "Irish", dialCode: "+353" },
  { code: "AU", name: "Australia", nationality: "Australian", dialCode: "+61" },
  { code: "NZ", name: "New Zealand", nationality: "New Zealander", dialCode: "+64" },
];

export function getCountryByCode(code) {
  return (
    COUNTRY_CATALOG.find(
      (country) =>
        country.code === code
    ) || null
  );
}

export function getCountryByName(name) {
  const normalized =
    String(name || "")
      .trim()
      .toLowerCase();

  return (
    COUNTRY_CATALOG.find(
      (country) =>
        country.name.toLowerCase() ===
        normalized
    ) || null
  );
}

export function getCountryFlag(code) {
  const normalized =
    String(code || "")
      .trim()
      .toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalized)) {
    return "";
  }

  return String.fromCodePoint(
    ...normalized
      .split("")
      .map(
        (letter) =>
          127397 +
          letter.charCodeAt(0)
      )
  );
}