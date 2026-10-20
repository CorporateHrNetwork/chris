"use strict";
const POLICY = Object.freeze({
  version: "ZLL-PE-1.0",
  title: "Zermatt Liquor Limited — Quarterly Performance Evaluation Policy",
  timezone: "Africa/Lagos",
  weights: { results: 60, quality: 20, teamwork: 20 },
  bands: [
    { minimum: 1, maximumExclusive: 2, label: "Unsatisfactory" },
    { minimum: 2, maximumExclusive: 3, label: "Needs improvement" },
    { minimum: 3, maximumExclusive: 3.5, label: "Meets expectations" },
    { minimum: 3.5, maximumExclusive: 4.5, label: "Exceeds expectations" },
    { minimum: 4.5, maximumExclusive: 5.01, label: "Exceptional" }
  ],
  ratingAnchors: ["1 — Unsatisfactory", "2 — Needs improvement", "3 — Meets expectations", "4 — Exceeds expectations", "5 — Exceptional"],
  rules: [
    "The HR AI Performance Evaluation Agent opens each calendar quarter and assigns published role standards. HR oversees the process.",
    "Goals, targets, weights, measurement methods and evidence requirements are visible to the employee and manager before assessment begins.",
    "Role results carry 60%, quality and customer service 20%, and teamwork and workplace conduct 20%. The same event must not be counted twice.",
    "AI-generated standards are drafts. HR validates the job description, targets and rating anchors before publication. Missing role or manager mappings are HR exceptions.",
    "Published standards and policy are snapshotted for each cycle. Amendments apply prospectively and require a new version; existing scorecards are not silently changed.",
    "At quarter end the employee submits a self-review; the assigned manager rates each goal with evidence and records a feedback discussion.",
    "HR validates or returns the manager review. Only a validated result is released to the employee.",
    "Acknowledgment confirms receipt, not agreement. Employees may dispute within seven calendar days of release; an independent HR-designated reviewer decides the appeal.",
    "Development and supported improvement actions are recorded separately. Ratings never automatically create disciplinary sanctions, salary changes, promotion or dismissal.",
    "New hires and transfers after scorecards are issued are referred to HR for prospective handling. Authorized reassignment records a reason and notifies the parties.",
    "Self-review is due seven calendar days after quarter end; manager review by day fourteen; HR review by day twenty-one. Overdue tasks are reminded daily and visible to HR.",
    "Access is limited to the employee, assigned manager, authorized HR and the designated independent appeal reviewer. Actions are dated and auditable."
  ]
});
function fail(message, statusCode = 400) { const e = new Error(message); e.statusCode = statusCode; throw e; }
function required(v, label) { if (typeof v !== "string" || !v.trim() || v.length > 20000) fail(label + " is required (maximum 20,000 characters)."); return v.trim(); }
function validateGoals(goals) {
  if (!Array.isArray(goals) || goals.length < 3 || goals.length > 8) fail("Provide 3–8 goals.");
  const seen = new Set(), totals = { results: 0, quality: 0, teamwork: 0 };
  for (const g of goals) {
    required(g.id, "Goal ID"); if (seen.has(g.id)) fail("Duplicate goal ID."); seen.add(g.id);
    if (!Object.hasOwn(totals,g.category) || !Number.isFinite(g.weight) || g.weight <= 0) fail("Invalid goal category or weight.");
    totals[g.category] += g.weight;
    for (const k of ["title", "target", "measurement", "evidence"]) required(g[k], k);
    if (!Array.isArray(g.anchors) || g.anchors.length !== 5) fail("Five role-specific rating descriptions are required.");
    g.anchors.forEach(a => required(a, "Rating description"));
  }
  for (const k of Object.keys(totals)) if (Math.abs(totals[k] - POLICY.weights[k]) > 0.001) fail(k + " weights must total " + POLICY.weights[k] + "%.");
  return goals;
}
function score(goals, ratings) {
  validateGoals(goals);
  if (!Array.isArray(ratings) || ratings.length !== goals.length || new Set(ratings.map(r => r.goalId)).size !== goals.length) fail("Rate every goal exactly once.");
  let total = 0;
  for (const g of goals) {
    const r = ratings.find(r => r.goalId === g.id);
    if (!r || !Number.isInteger(r.rating) || r.rating < 1 || r.rating > 5) fail("Ratings must be integers from 1 to 5.");
    required(r.evidence, "Rating evidence"); total += g.weight * r.rating / 100;
  }
  // Classify the unrounded value; rounding cannot move an employee into a higher band.
  const band = POLICY.bands.find(b => total >= b.minimum && total < b.maximumExclusive);
  if (!band) fail("Invalid weighted score.");
  return { score: Number(total.toFixed(4)), band: band.label };
}
function lagosDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: POLICY.timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
function quarter(now = new Date()) {
  const date = lagosDate(now), year = Number(date.slice(0,4)), q = Math.floor((Number(date.slice(5,7))-1)/3)+1;
  const start = year + "-" + String((q-1)*3+1).padStart(2,"0") + "-01";
  const end = new Date(Date.UTC(year,q*3,0)).toISOString().slice(0,10);
  return { key: year + "-Q" + q, year, quarter: q, start, end };
}
function plusDays(date, days) { return new Date(Date.parse(date + "T00:00:00Z") + days * 86400000).toISOString().slice(0,10); }
function draftGoals(kpis) {
  const items = Array.isArray(kpis) && kpis.length ? kpis.slice(0,4) : [{ title:"Role delivery", target:"HR to confirm against job description", measurement:"Approved deliverables", weight:100 }];
  const sum = items.reduce((n,k) => n + (Number(k.weight) > 0 ? Number(k.weight) : 1), 0);
  let allocated = 0;
  const goals = items.map((k,i) => {
    const weight = i === items.length-1 ? Number((60-allocated).toFixed(2)) : Number((60*(Number(k.weight)>0?Number(k.weight):1)/sum).toFixed(2));
    allocated += weight;
    return { id:"result-"+(i+1), category:"results", title:k.title || "Role delivery", target:k.target || "HR to confirm",
      measurement:k.measurement || "Approved deliverable", weight, evidence:"HR to specify the verified source record",
      anchors:["HR to define materially below target","HR to define below target","HR to define meeting target","HR to define exceeding target","HR to define exceptional achievement"] };
  });
  for (const [category,title] of [["quality","Work quality and customer service"],["teamwork","Teamwork and workplace conduct"]]) goals.push({
    id:category, category, title, weight:20, target:"HR to define observable expectations for this role",
    measurement:"HR to define a role-specific measure", evidence:"HR to specify evidence; do not duplicate result evidence",
    anchors:["HR to define unsatisfactory behaviour","HR to define improvement needed","HR to define expected behaviour","HR to define exceeding expectations","HR to define exceptional behaviour"]
  });
  return goals;
}
function assertPublishable(goals) {
  validateGoals(goals);
  if (/HR to (define|confirm|specify)/i.test(JSON.stringify(goals))) fail("Replace all draft targets, evidence sources and rating descriptions before publishing.");
}
module.exports = { POLICY, fail, required, validateGoals, score, lagosDate, quarter, plusDays, draftGoals, assertPublishable };
