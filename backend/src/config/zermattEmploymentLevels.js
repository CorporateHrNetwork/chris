const ZERMATT_EMPLOYMENT_LEVELS = [
  { levelNumber: 1, code: "L1", name: "Entry / Trainee", description: "Trainees, interns, entry support and other supervised starter roles." },
  { levelNumber: 2, code: "L2", name: "Junior Support / Assistant", description: "Assistants and junior support employees performing defined operational or administrative duties." },
  { levelNumber: 3, code: "L3", name: "Senior Support / Technician", description: "Experienced support, technical and skilled operational employees working with limited supervision." },
  { levelNumber: 4, code: "L4", name: "Junior Officer / Associate", description: "Junior officers and developing professional individual contributors." },
  { levelNumber: 5, code: "L5", name: "Officer / Professional", description: "Established officers and professional individual contributors accountable for defined workstreams." },
  { levelNumber: 6, code: "L6", name: "Supervisor / Team Lead", description: "Front-line supervisors, coordinators and team leads with direct operational oversight." },
  { levelNumber: 7, code: "L7", name: "Senior Officer / Senior Professional", description: "Senior officers, senior professionals and principal individual contributors with substantial responsibility." },
  { levelNumber: 8, code: "L8", name: "Assistant Manager", description: "Assistant managers and equivalent roles supporting management of a unit, branch or function." },
  { levelNumber: 9, code: "L9", name: "Manager", description: "Managers accountable for a team, branch, unit or significant functional area." },
  { levelNumber: 10, code: "L10", name: "Head of Department", description: "Heads of department, senior functional leaders and equivalent business-unit leadership roles." },
  { levelNumber: 11, code: "L11", name: "Executive Management", description: "Executive management and the highest organizational leadership roles." },
].map((level) => ({ ...level, displayOrder: level.levelNumber, isActive: true }));

module.exports = { ZERMATT_EMPLOYMENT_LEVELS };
