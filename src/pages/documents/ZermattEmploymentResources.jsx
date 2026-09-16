import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "../../services/api";

const TABS = [
  ["legal", "Nigerian Employment Resources"],
  ["policy", "Employment Policy"],
  ["offer", "Employment Offer"],
  ["jobs", "Job Descriptions"],
  ["onboarding", "Onboarding Material"],
  ["templates", "HR Templates"],
];

export default function ZermattEmploymentResources() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("legal");
  const [search, setSearch] = useState("");
  const [selectedJob, setSelectedJob] = useState(null);

  useEffect(() => {
    let active = true;
    apiRequest("/api/zermatt/employment-resources")
      .then((response) => { if (active) setData(response?.data || null); })
      .catch((err) => { if (active) setError(err.message || "Unable to load employment resources."); });
    return () => { active = false; };
  }, []);

  const jobs = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = data?.jobDescriptions || [];
    if (!term) return rows;
    return rows.filter((row) => [row.jobTitle, row.designationCode, row.function, row.employmentLevel].some((value) => String(value || "").toLowerCase().includes(term)));
  }, [data, search]);

  if (error) return <section style={panel}><div style={errorStyle}>{error}</div></section>;
  if (!data) return <section style={panel}>Loading Zermatt employment resources…</section>;

  return <div style={{ color: "var(--chris-text-main)" }}>
    <div style={{ marginBottom: 22 }}>
      <div style={eyebrow}>DOCUMENTS · EMPLOYMENT RESOURCES</div>
      <h1 style={{ margin: "7px 0 6px", fontSize: "var(--chris-font-2xl)" }}>Zermatt Employment Resource Library</h1>
      <p style={lead}>Controlled HR working materials, statutory references, role descriptions, onboarding packs and reusable templates for Zermatt Liquor Limited.</p>
      <div style={notice}>{data.disclaimer}</div>
    </div>

    <div style={metrics}>
      <Metric label="Legal / Compliance Guides" value={data.summary?.legalResources} />
      <Metric label="Job Descriptions" value={data.summary?.jobDescriptions} />
      <Metric label="Onboarding Materials" value={data.summary?.onboardingMaterials} />
      <Metric label="HR Templates" value={data.summary?.hrTemplates} />
    </div>

    <div style={tabs}>{TABS.map(([key, label]) => <button key={key} type="button" onClick={() => setTab(key)} style={{ ...tabButton, ...(tab === key ? activeTab : {}) }}>{label}</button>)}</div>

    {tab === "legal" && <Grid>{(data.legalResources || []).map((item) => <ResourceCard key={item.id} item={item} />)}</Grid>}
    {tab === "policy" && <Document title={data.employmentPolicy?.title} subtitle={`Version: ${data.employmentPolicy?.version}`}>{(data.employmentPolicy?.sections || []).map(([heading, text]) => <Section key={heading} heading={heading} text={text} />)}</Document>}
    {tab === "offer" && <Document title={data.employmentOfferTemplate?.title} subtitle="Reusable Zermatt recruitment / appointment working template. Management and HR must complete all placeholders before issue.">{(data.employmentOfferTemplate?.body || []).map((line, index) => <p key={index} style={paragraph}>{line}</p>)}</Document>}
    {tab === "jobs" && <>
      <section style={panel}><div style={row}><div><h2 style={h2}>Job Descriptions</h2><p style={muted}>Generated from the authoritative Zermatt designation catalogue so every configured role has a controlled JD baseline.</p></div><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, code, function or level" style={input} /></div></section>
      <Grid>{jobs.map((job) => <button type="button" key={job.id} style={{ ...card, textAlign: "left", cursor: "pointer" }} onClick={() => setSelectedJob(job)}><div style={tag}>{job.designationCode}</div><h3 style={h3}>{job.jobTitle}</h3><div style={muted}>{job.function}</div><div style={{ ...muted, marginTop: 5 }}>{job.employmentLevel}</div><div style={openText}>OPEN JOB DESCRIPTION →</div></button>)}</Grid>
      {selectedJob && <JobDescription job={selectedJob} onClose={() => setSelectedJob(null)} />}
    </>}
    {tab === "onboarding" && <Grid>{(data.onboardingMaterials || []).map((item) => <SimpleCard key={item.id} title={item.title} content={item.content} />)}</Grid>}
    {tab === "templates" && <Grid>{(data.hrTemplates || []).map((item) => <SimpleCard key={item.id} title={item.title} content={item.content} />)}</Grid>}
  </div>;
}

function ResourceCard({ item }) {
  return <article style={card}><div style={tag}>{item.category}</div><h3 style={h3}>{item.title}</h3><div style={authority}>{item.authority}</div>{(item.sections || []).map(([heading, text]) => <Section key={heading} heading={heading} text={text} />)}<div style={review}>{item.reviewNote}</div><a href={item.sourceUrl} target="_blank" rel="noreferrer" style={link}>Open official source ↗</a></article>;
}
function SimpleCard({ title, content }) { return <article style={card}><h3 style={h3}>{title}</h3><p style={paragraph}>{content}</p></article>; }
function Document({ title, subtitle, children }) { return <section style={panel}><h2 style={h2}>{title}</h2><p style={muted}>{subtitle}</p><div style={{ marginTop: 18 }}>{children}</div></section>; }
function Section({ heading, text }) { return <div style={{ marginTop: 13 }}><strong style={{ color: "var(--chris-gold)" }}>{heading}</strong><p style={paragraph}>{text}</p></div>; }
function Metric({ label, value }) { return <div style={panel}><div style={muted}>{label}</div><div style={{ fontSize: 28, fontWeight: 900, marginTop: 7 }}>{value ?? "—"}</div></div>; }
function Grid({ children }) { return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14, marginTop: 18 }}>{children}</div>; }
function JobDescription({ job, onClose }) {
  return <section style={{ ...panel, marginTop: 18 }}>
    <div style={row}><div><div style={tag}>{job.designationCode}</div><h2 style={h2}>{job.jobTitle}</h2><p style={muted}>{job.function} · {job.employmentLevel}</p></div><button type="button" style={closeButton} onClick={onClose}>Close</button></div>
    <Section heading="Role Purpose" text={job.rolePurpose} />
    <Section heading="Reports To" text={job.reportsTo} />
    <Section heading="Location Scope" text={job.locationScope} />
    <List title="Key Responsibilities" items={job.responsibilities} />
    <List title="Key Performance Indicators" items={job.kpis} />
    <Section heading="Qualifications / Experience" text={job.qualifications} />
    <List title="Core Competencies" items={job.competencies} />
    <List title="Compliance & Internal Controls" items={job.compliance} />
    <div style={review}>{job.documentStatus}</div>
    <div style={{ marginTop: 12 }}><button type="button" style={printButton} onClick={() => window.print()}>Print / Save as PDF</button></div>
  </section>;
}
function List({ title, items }) { return <div style={{ marginTop: 14 }}><strong style={{ color: "var(--chris-gold)" }}>{title}</strong><ul style={{ color: "var(--chris-text-secondary)", lineHeight: 1.7 }}>{(items || []).map((item) => <li key={item}>{item}</li>)}</ul></div>; }

const panel = { background: "linear-gradient(145deg, rgba(12,38,26,.90), rgba(7,18,13,.96))", border: "1px solid var(--chris-border-gold)", borderRadius: "var(--chris-radius-card)", padding: 20, boxShadow: "var(--chris-shadow-card)" };
const card = { ...panel, minHeight: 150 };
const metrics = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 };
const tabs = { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 };
const tabButton = { border: "1px solid var(--chris-border-soft)", borderRadius: 9, background: "rgba(255,255,255,.03)", color: "var(--chris-text-secondary)", padding: "9px 12px", fontWeight: 800, cursor: "pointer" };
const activeTab = { borderColor: "var(--chris-gold)", color: "var(--chris-gold)", background: "rgba(212,175,55,.08)" };
const eyebrow = { color: "var(--chris-gold)", fontSize: "var(--chris-font-sm)", fontWeight: 900, letterSpacing: ".15em" };
const lead = { color: "var(--chris-text-secondary)", lineHeight: 1.6, maxWidth: 980 };
const notice = { marginTop: 12, padding: 12, borderRadius: 9, border: "1px solid var(--chris-border-soft)", color: "var(--chris-text-secondary)", fontSize: 12, lineHeight: 1.6 };
const h2 = { margin: "3px 0 5px", fontSize: 21 };
const h3 = { margin: "8px 0 6px", fontSize: 17 };
const muted = { margin: 0, color: "var(--chris-text-secondary)", lineHeight: 1.55, fontSize: 13 };
const paragraph = { margin: "6px 0 0", color: "var(--chris-text-secondary)", lineHeight: 1.65, fontSize: 13 };
const tag = { display: "inline-block", color: "var(--chris-gold)", fontSize: 10, fontWeight: 900, letterSpacing: ".1em" };
const authority = { color: "var(--chris-text-muted)", fontSize: 12, marginBottom: 8 };
const review = { marginTop: 14, padding: 10, borderRadius: 8, background: "rgba(212,175,55,.06)", color: "var(--chris-text-secondary)", fontSize: 11, lineHeight: 1.55 };
const link = { display: "inline-block", marginTop: 12, color: "var(--chris-gold)", fontWeight: 800, fontSize: 12 };
const openText = { marginTop: 14, color: "var(--chris-gold)", fontWeight: 900, fontSize: 10 };
const row = { display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" };
const input = { minWidth: 280, borderRadius: 9, border: "1px solid var(--chris-border-gold)", background: "rgba(255,255,255,.04)", color: "var(--chris-text-main)", padding: "10px 12px" };
const closeButton = { ...tabButton, color: "var(--chris-gold)" };
const printButton = { border: 0, borderRadius: 9, padding: "10px 14px", background: "var(--chris-gold)", color: "#07140D", fontWeight: 900, cursor: "pointer" };
const errorStyle = { color: "#FCA5A5", lineHeight: 1.6 };
