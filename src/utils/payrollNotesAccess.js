export function hasPayrollNotesAccess(profile) {
  if (profile?.organization?.slug !== 'zermatt-liquor-limited') return false;
  const roles=new Set((profile.roles || []).map(r=>String(r).trim().toUpperCase().replace(/\s+/g,' ')));
  return ['HEAD HR','HEAD OF HR','HEAD_HR','HEAD_HR_VERIFIER','HEAD OF HUMAN RESOURCES','HEAD OF HR & ADMIN','HEAD OF HUMAN RESOURCES & ADMINISTRATION','HR & ADMIN OFFICER - BRANCH','BRANCH HR & ADMIN OFFICER','HR & ADMIN OFFICER','HR AND ADMIN OFFICER','HEAD OF AUDIT & INTERNAL CONTROL','HEAD OF AUDIT & INTERNAL CONTROLS','HEAD AUDIT & INTERNAL CONTROL','HEAD AUDIT & INTERNAL CONTROLS','HEAD_AUDIT_INTERNAL_CONTROL'].some(r=>roles.has(r));
}
