// Ordinary Pension Fund Administrators listed by Nigeria's National Pension
// Commission. Closed PFAs and Pension Fund Custodians belong to separate
// PenCom registries and are intentionally excluded from employee selection.
export const NIGERIA_PFAS = Object.freeze([
  { code: "ACCESS_ARM", name: "Access ARM Pensions Limited" },
  { code: "CARDINALSTONE", name: "Cardinal Stone Pensions Limited" },
  { code: "CITIZENS", name: "Citizens Pensions Limited" },
  { code: "CRUSADER_STERLING", name: "Crusader Sterling Pensions Limited" },
  { code: "FCMB", name: "FCMB Pensions Limited" },
  { code: "FIDELITY", name: "Fidelity Pension Managers Limited" },
  { code: "GT_PENSION", name: "Guaranty Trust Pension Managers Limited" },
  { code: "LEADWAY", name: "Leadway PFA Limited" },
  { code: "NUPEMCO", name: "Nigerian University Pension Management Company (NUPEMCO)" },
  { code: "NLPC", name: "NLPC Pension Fund Administrators Limited" },
  { code: "NORRENBERGER", name: "Norrenberger Pensions Limited" },
  { code: "NPF", name: "NPF Pension Managers Limited" },
  { code: "OAK", name: "OAK Pensions Limited" },
  { code: "PARTHIAN", name: "Parthian Pensions Limited" },
  { code: "PREMIUM", name: "Premium Pension Limited" },
  { code: "STANBIC_IBTC", name: "Stanbic IBTC Pension Managers Limited" },
  { code: "TANGERINE_APT", name: "Tangerine APT Pensions Limited" },
  { code: "TRUSTFUND", name: "Trustfund Pensions Limited" },
  { code: "VERITAS_GLANVILLS", name: "Veritas Glanvills Pensions Limited" },
]);

export function findNigeriaPfa(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return NIGERIA_PFAS.find((pfa) =>
    pfa.code.toLowerCase() === normalized || pfa.name.toLowerCase() === normalized
  ) || null;
}
