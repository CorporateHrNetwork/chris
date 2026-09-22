const states = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa",
  "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti",
  "Enugu", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
  "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun",
  "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba",
  "Yobe", "Zamfara",
];

export const nigeriaLeaveJurisdictions = [
  { value: "NG-FEDERAL", label: "Nigeria — Federal" },
  ...states.map((state) => ({
    value: `NG-${state.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
    label: `${state} State, Nigeria`,
  })),
  { value: "NG-FCT", label: "Federal Capital Territory, Nigeria" },
];

