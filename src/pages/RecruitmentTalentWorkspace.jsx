import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaArrowLeft,
  FaBriefcase,
  FaCalendarCheck,
  FaCheck,
  FaFileSignature,
  FaPlus,
  FaSyncAlt,
  FaUserCheck,
  FaUsers,
} from "react-icons/fa";
import { apiRequest } from "../services/api";
import useAuthorization from "../hooks/useAuthorization";

const STAGE_ACTIONS = {
  APPLIED: ["SCREENING", "WITHDRAWN"],
  SCREENING: ["SHORTLISTED", "REJECTED", "TALENT_POOL", "WITHDRAWN"],
  SHORTLISTED: ["INTERVIEW", "REJECTED", "TALENT_POOL", "WITHDRAWN"],
  INTERVIEW: ["REJECTED", "TALENT_POOL", "WITHDRAWN"],
  OFFER: ["WITHDRAWN", "TALENT_POOL"],
};

const EMPTY_CANDIDATE = {
  vacancyId: "",
  candidateId: "",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  alternatePhone: "",
  source: "DIRECT",
  city: "",
  state: "",
  country: "Nigeria",
  cvFileName: "",
  cvReference: "",
  coverNote: "",
  privacyConsent: false,
};

const EMPTY_INTERVIEW = {
  applicationId: "",
  title: "Interview",
  scheduledAt: "",
  mode: "IN_PERSON",
  venueOrLink: "",
  panel: "",
};

const EMPTY_OFFER = {
  applicationId: "",
  currency: "NGN",
  grossMonthly: "",
  proposedStartDate: "",
  expiryDate: "",
  notes: "",
};

const MODE_META = {
  candidates: { eyebrow: "RECRUITMENT · CANDIDATES", title: "Candidates", icon: <FaUsers /> },
  interviews: { eyebrow: "RECRUITMENT · INTERVIEWS", title: "Interviews", icon: <FaCalendarCheck /> },
  offers: { eyebrow: "RECRUITMENT · OFFERS", title: "Offers", icon: <FaFileSignature /> },
  ats: { eyebrow: "RECRUITMENT · APPLICANT TRACKING", title: "Applicant Tracking System", icon: <FaBriefcase /> },
  "talent-pool": { eyebrow: "RECRUITMENT · TALENT POOL", title: "Talent Pool", icon: <FaUserCheck /> },
};

function RecruitmentTalentWorkspace({ mode = "candidates" }) {
  const navigate = useNavigate();
  const { hasPermission } = useAuthorization();
  const canManage = hasPermission("recruitment.manage");
  const [summary, setSummary] = useState(null);
  const [options, setOptions] = useState({ scope: null, vacancies: [], candidates: [] });
  const [candidates, setCandidates] = useState([]);
  const [applications, setApplications] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [offers, setOffers] = useState([]);
  const [talentPool, setTalentPool] = useState([]);
  const [candidateForm, setCandidateForm] = useState(EMPTY_CANDIDATE);
  const [interviewForm, setInterviewForm] = useState(EMPTY_INTERVIEW);
  const [offerForm, setOfferForm] = useState(EMPTY_OFFER);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const [summaryResult, optionResult, candidateResult, applicationResult, interviewResult, offerResult, poolResult] = await Promise.all([
        apiRequest("/api/recruitment/talent/summary"),
        apiRequest("/api/recruitment/candidates/options"),
        apiRequest("/api/recruitment/candidates"),
        apiRequest("/api/recruitment/applications"),
        apiRequest("/api/recruitment/interviews"),
        apiRequest("/api/recruitment/offers"),
        apiRequest("/api/recruitment/talent-pool"),
      ]);
      setSummary(summaryResult?.data || null);
      setOptions(optionResult?.data || { scope: null, vacancies: [], candidates: [] });
      setCandidates(candidateResult?.data || []);
      setApplications(applicationResult?.data || []);
      setInterviews(interviewResult?.data || []);
      setOffers(offerResult?.data || []);
      setTalentPool(poolResult?.data || []);
    } catch (err) {
      setError(err?.message || "Unable to load Recruitment Release-2 workspace.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const onLocation = () => {
      setCandidateForm(EMPTY_CANDIDATE);
      setInterviewForm(EMPTY_INTERVIEW);
      setOfferForm(EMPTY_OFFER);
      setMessage("");
      load();
    };
    window.addEventListener("chris:location-context-changed", onLocation);
    return () => window.removeEventListener("chris:location-context-changed", onLocation);
  }, [load]);

  const headOffice = (options?.scope || summary?.scope)?.mode === "HEAD_OFFICE_CONSOLIDATED";
  const meta = MODE_META[mode] || MODE_META.candidates;

  const execute = async (work, fallback) => {
    try {
      setSaving(true);
      setError("");
      setMessage("");
      const result = await work();
      setMessage(result?.message || "Recruitment record updated.");
      await load();
      return result;
    } catch (err) {
      setError(err?.message || fallback);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const createCandidate = async (event) => {
    event.preventDefault();
    const result = await execute(
      () => apiRequest("/api/recruitment/candidates/applications", {
        method: "POST",
        body: {
          ...candidateForm,
          candidateId: candidateForm.candidateId || undefined,
          privacyConsent: candidateForm.candidateId ? undefined : candidateForm.privacyConsent,
        },
      }),
      "Unable to create candidate application."
    );
    if (result) setCandidateForm(EMPTY_CANDIDATE);
  };

  const moveStage = async (application, stage) => {
    let reason = "";
    if (["REJECTED", "WITHDRAWN", "TALENT_POOL"].includes(stage)) {
      const response = window.prompt(`${friendly(stage)} reason / note:`, "");
      if (response === null) return;
      reason = response;
    }
    await execute(
      () => apiRequest(`/api/recruitment/applications/${application.id}/stage`, {
        method: "POST",
        body: { stage, reason },
      }),
      "Unable to move application stage."
    );
  };

  const scheduleInterview = async (event) => {
    event.preventDefault();
    const result = await execute(
      () => apiRequest(`/api/recruitment/applications/${interviewForm.applicationId}/interviews`, {
        method: "POST",
        body: interviewForm,
      }),
      "Unable to schedule interview."
    );
    if (result) setInterviewForm(EMPTY_INTERVIEW);
  };

  const completeInterview = async (row) => {
    const overallScore = window.prompt("Interview score (0-100, optional):", "");
    if (overallScore === null) return;
    const recommendation = window.prompt("Recommendation: PROCEED, HOLD or REJECT", "PROCEED");
    if (recommendation === null) return;
    const notes = window.prompt("Interview notes (optional):", "");
    if (notes === null) return;
    await execute(
      () => apiRequest(`/api/recruitment/interviews/${row.id}/complete`, {
        method: "POST",
        body: { overallScore, recommendation, notes },
      }),
      "Unable to complete interview."
    );
  };

  const cancelInterview = async (row) => {
    const reason = window.prompt("Interview cancellation reason:", "");
    if (reason === null) return;
    await execute(
      () => apiRequest(`/api/recruitment/interviews/${row.id}/cancel`, { method: "POST", body: { reason } }),
      "Unable to cancel interview."
    );
  };

  const createOffer = async (event) => {
    event.preventDefault();
    const result = await execute(
      () => apiRequest(`/api/recruitment/applications/${offerForm.applicationId}/offers`, {
        method: "POST",
        body: { ...offerForm, grossMonthly: Number(offerForm.grossMonthly) },
      }),
      "Unable to prepare offer."
    );
    if (result) setOfferForm(EMPTY_OFFER);
  };

  const offerAction = async (row, action) => {
    let reason = "";
    if (action === "withdraw") {
      const response = window.prompt("Offer withdrawal reason:", "");
      if (response === null) return;
      reason = response;
    }
    await execute(
      () => apiRequest(`/api/recruitment/offers/${row.id}/${action}`, { method: "POST", body: { reason } }),
      "Unable to update offer."
    );
  };

  const updatePool = async (candidate, status) => {
    const notes = window.prompt(`Talent Pool note for ${candidate.firstName} ${candidate.lastName}:`, candidate.talentPoolNotes || "");
    if (notes === null) return;
    await execute(
      () => apiRequest(`/api/recruitment/candidates/${candidate.id}/talent-pool`, { method: "POST", body: { status, notes } }),
      "Unable to update Talent Pool."
    );
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <button type="button" style={linkButtonStyle} onClick={() => navigate("/recruitment")}>
            <FaArrowLeft /> Recruitment Dashboard
          </button>
          <div style={eyebrowStyle}>{meta.eyebrow}</div>
          <h1 style={titleStyle}>{meta.title}</h1>
          <p style={subtitleStyle}>{descriptionFor(mode)}</p>
        </div>
        <div style={headerActionsStyle}>
          <span style={scopePillStyle}>
            {headOffice ? "HEAD OFFICE · CONSOLIDATED" : `${options?.scope?.locationName || summary?.scope?.locationName || "BRANCH"}${options?.scope?.locationCode ? ` · ${options.scope.locationCode}` : ""}`}
          </span>
          <button type="button" style={secondaryButtonStyle} onClick={load} disabled={loading || saving}><FaSyncAlt /> Refresh</button>
        </div>
      </div>

      <div style={navStripStyle}>
        {[
          ["candidates", "Candidates"],
          ["ats", "Applicant Tracking"],
          ["interviews", "Interviews"],
          ["offers", "Offers"],
          ["talent-pool", "Talent Pool"],
        ].map(([key, label]) => (
          <button key={key} type="button" style={mode === key ? activeTabStyle : tabStyle} onClick={() => navigate(`/recruitment/${key}`)}>{label}</button>
        ))}
      </div>

      {error && <div style={errorStyle}>{error}</div>}
      {message && <div style={successStyle}>{message}</div>}

      <div style={metricsStyle}>
        <Metric label="Candidates" value={loading ? "…" : summary?.candidates || 0} />
        <Metric label="Applications" value={loading ? "…" : summary?.applications || 0} />
        <Metric label="Interviews" value={loading ? "…" : summary?.interview || 0} />
        <Metric label="Offers" value={loading ? "…" : summary?.offer || 0} />
        <Metric label="Hired" value={loading ? "…" : summary?.hired || 0} />
      </div>

      {mode === "candidates" && (
        <CandidatesWorkspace
          canManage={canManage}
          form={candidateForm}
          setForm={setCandidateForm}
          options={options}
          candidates={candidates}
          loading={loading}
          saving={saving}
          onSubmit={createCandidate}
          onPool={updatePool}
          onOpenVacancies={() => navigate("/recruitment/vacancies")}
        />
      )}

      {mode === "ats" && (
        <AtsWorkspace applications={applications} canManage={canManage} loading={loading} saving={saving} onMove={moveStage} />
      )}

      {mode === "interviews" && (
        <InterviewsWorkspace
          applications={applications}
          interviews={interviews}
          form={interviewForm}
          setForm={setInterviewForm}
          canManage={canManage}
          loading={loading}
          saving={saving}
          onSubmit={scheduleInterview}
          onComplete={completeInterview}
          onCancel={cancelInterview}
        />
      )}

      {mode === "offers" && (
        <OffersWorkspace
          applications={applications}
          offers={offers}
          form={offerForm}
          setForm={setOfferForm}
          canManage={canManage}
          headOffice={headOffice}
          loading={loading}
          saving={saving}
          onSubmit={createOffer}
          onAction={offerAction}
        />
      )}

      {mode === "talent-pool" && (
        <TalentPoolWorkspace candidates={talentPool} canManage={canManage} loading={loading} saving={saving} onPool={updatePool} />
      )}
    </div>
  );
}

function CandidatesWorkspace({ canManage, form, setForm, options, candidates, loading, saving, onSubmit, onPool, onOpenVacancies }) {
  const existing = Boolean(form.candidateId);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const noPublishedVacancies = !loading && (options.vacancies || []).length === 0;
  return (
    <>
      {canManage && (
        <form style={panelStyle} onSubmit={onSubmit}>
          <PanelTitle eyebrow="NEW APPLICATION" title="Candidate & Vacancy Application" subtitle="Create one reusable candidate identity and attach it to a published vacancy. Existing candidates can be reused without duplicating the person." />
          {noPublishedVacancies && (
            <div style={warningStyle}>
              <strong>No published vacancies are available in this operating context.</strong>
              <span>Create/approve a requisition, create its vacancy, then publish the vacancy before adding candidates.</span>
              <button type="button" style={secondaryButtonStyle} onClick={onOpenVacancies}>Open Vacancies</button>
            </div>
          )}
          <div style={formGridStyle}>
            <Field label="Published Vacancy">
              <select value={form.vacancyId} onChange={(e) => set("vacancyId", e.target.value)} required disabled={noPublishedVacancies} style={inputStyle}>
                <option value="">{noPublishedVacancies ? "No published vacancies available" : "Select published vacancy"}</option>
                {(options.vacancies || []).map((row) => <option key={row.id} value={row.id}>{row.vacancyNumber} · {row.title} · {row.locationCode || row.locationName}</option>)}
              </select>
            </Field>
            <Field label="Existing Candidate (optional)">
              <select value={form.candidateId} onChange={(e) => set("candidateId", e.target.value)} style={inputStyle}>
                <option value="">Create new candidate</option>
                {(options.candidates || []).map((row) => <option key={row.id} value={row.id}>{row.candidateNumber} · {row.firstName} {row.lastName}</option>)}
              </select>
            </Field>
          </div>
          {!existing && (
            <>
              <div style={formGridStyle}>
                <Field label="First Name"><input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} required style={inputStyle} /></Field>
                <Field label="Last Name"><input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} required style={inputStyle} /></Field>
                <Field label="Email"><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required style={inputStyle} /></Field>
                <Field label="Phone"><input value={form.phone} onChange={(e) => set("phone", e.target.value)} style={inputStyle} /></Field>
                <Field label="Source">
                  <select value={form.source} onChange={(e) => set("source", e.target.value)} style={inputStyle}>
                    {['DIRECT','REFERRAL','LINKEDIN','JOB_BOARD','AGENCY','CAREER_SITE','OTHER'].map((x) => <option key={x} value={x}>{friendly(x)}</option>)}
                  </select>
                </Field>
                <Field label="CV File Name"><input value={form.cvFileName} onChange={(e) => set("cvFileName", e.target.value)} placeholder="e.g. Ada_Okafor_CV.pdf" style={inputStyle} /></Field>
                <Field label="CV / Document Reference"><input value={form.cvReference} onChange={(e) => set("cvReference", e.target.value)} placeholder="File reference or secure document location" style={inputStyle} /></Field>
                <Field label="State"><input value={form.state} onChange={(e) => set("state", e.target.value)} style={inputStyle} /></Field>
              </div>
              <label style={consentStyle}>
                <input type="checkbox" checked={form.privacyConsent} onChange={(e) => set("privacyConsent", e.target.checked)} required />
                Candidate privacy / recruitment-data processing consent has been captured.
              </label>
            </>
          )}
          <Field label="Application / Cover Note"><textarea rows={3} value={form.coverNote} onChange={(e) => set("coverNote", e.target.value)} style={textareaStyle} /></Field>
          <button type="submit" disabled={saving || noPublishedVacancies} style={primaryButtonStyle}><FaPlus /> {saving ? "Saving…" : "Create Application"}</button>
        </form>
      )}
      <Register title="Candidate Register" empty="No candidates in this operating context." columns={["Candidate", "Contact", "Source", "Applications", "Talent Pool", "Actions"]} loading={loading} rows={candidates.map((row) => [
        <CellMain key="a" title={`${row.firstName} ${row.lastName}`} subtitle={row.candidateNumber} />,
        <CellMain key="b" title={row.email} subtitle={row.phone || "—"} />,
        friendly(row.source),
        row.applicationCount,
        friendly(row.talentPoolStatus),
        canManage ? <button key="c" type="button" style={miniButtonStyle} onClick={() => onPool(row, row.talentPoolStatus === "AVAILABLE" ? "ARCHIVED" : "AVAILABLE")}>{row.talentPoolStatus === "AVAILABLE" ? "Archive" : "Add to Pool"}</button> : "—",
      ])} />
    </>
  );
}

function AtsWorkspace({ applications, canManage, loading, saving, onMove }) {
  const counts = useMemo(() => Object.fromEntries(["APPLIED","SCREENING","SHORTLISTED","INTERVIEW","OFFER","HIRED","REJECTED","WITHDRAWN","TALENT_POOL"].map((stage) => [stage, applications.filter((row) => row.stage === stage).length])), [applications]);
  return (
    <>
      <div style={stageGridStyle}>{Object.entries(counts).map(([stage, count]) => <div key={stage} style={stageCardStyle}><span style={metricLabelStyle}>{friendly(stage)}</span><strong style={metricValueStyle}>{count}</strong></div>)}</div>
      <Register title="Applicant Pipeline" empty="No applications in this operating context." columns={["Application", "Candidate", "Vacancy", "Branch", "Stage", "Actions"]} loading={loading} rows={applications.map((row) => [
        row.applicationNumber,
        <CellMain key="a" title={`${row.firstName} ${row.lastName}`} subtitle={row.candidateNumber} />,
        <CellMain key="b" title={row.vacancyTitle} subtitle={row.vacancyNumber} />,
        row.locationCode || row.locationName,
        <Status key="c" status={row.stage} />,
        canManage && row.status === "ACTIVE" ? <div key="d" style={actionWrapStyle}>{(STAGE_ACTIONS[row.stage] || []).map((stage) => <button type="button" disabled={saving} key={stage} style={miniButtonStyle} onClick={() => onMove(row, stage)}>{friendly(stage)}</button>)}</div> : "—",
      ])} />
    </>
  );
}

function InterviewsWorkspace({ applications, interviews, form, setForm, canManage, loading, saving, onSubmit, onComplete, onCancel }) {
  const eligible = applications.filter((row) => row.status === "ACTIVE" && ["SHORTLISTED", "INTERVIEW"].includes(row.stage));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <>
      {canManage && (
        <form style={panelStyle} onSubmit={onSubmit}>
          <PanelTitle eyebrow="INTERVIEW SCHEDULING" title="Schedule Interview" subtitle="Interview rounds are permanently linked to the candidate application and active branch context." />
          <div style={formGridStyle}>
            <Field label="Application"><select value={form.applicationId} onChange={(e) => set("applicationId", e.target.value)} required style={inputStyle}><option value="">Select shortlisted application</option>{eligible.map((row) => <option key={row.id} value={row.id}>{row.applicationNumber} · {row.firstName} {row.lastName} · {row.vacancyTitle}</option>)}</select></Field>
            <Field label="Interview Title"><input value={form.title} onChange={(e) => set("title", e.target.value)} required style={inputStyle} /></Field>
            <Field label="Date & Time"><input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} required style={inputStyle} /></Field>
            <Field label="Mode"><select value={form.mode} onChange={(e) => set("mode", e.target.value)} style={inputStyle}><option value="IN_PERSON">In Person</option><option value="VIRTUAL">Virtual</option><option value="PHONE">Phone</option></select></Field>
            <Field label="Venue / Meeting Link"><input value={form.venueOrLink} onChange={(e) => set("venueOrLink", e.target.value)} style={inputStyle} /></Field>
            <Field label="Interview Panel"><input value={form.panel} onChange={(e) => set("panel", e.target.value)} placeholder="Names / panel description" style={inputStyle} /></Field>
          </div>
          <button type="submit" disabled={saving || eligible.length === 0} style={primaryButtonStyle}><FaCalendarCheck /> Schedule Interview</button>
        </form>
      )}
      <Register title="Interview Register" empty="No interviews have been scheduled." columns={["Candidate", "Vacancy", "Round", "Schedule", "Status", "Outcome", "Actions"]} loading={loading} rows={interviews.map((row) => [
        <CellMain key="a" title={`${row.firstName} ${row.lastName}`} subtitle={row.candidateNumber} />,
        row.vacancyTitle,
        row.roundNumber,
        <CellMain key="b" title={formatDateTime(row.scheduledAt)} subtitle={friendly(row.mode)} />,
        <Status key="c" status={row.status} />,
        row.status === "COMPLETED" ? `${row.overallScore ?? "—"} · ${friendly(row.recommendation)}` : "—",
        canManage && row.status === "SCHEDULED" ? <div key="d" style={actionWrapStyle}><button type="button" style={miniButtonStyle} onClick={() => onComplete(row)}>Complete</button><button type="button" style={miniDangerButtonStyle} onClick={() => onCancel(row)}>Cancel</button></div> : "—",
      ])} />
    </>
  );
}

function OffersWorkspace({ applications, offers, form, setForm, canManage, headOffice, loading, saving, onSubmit, onAction }) {
  const eligible = applications.filter((row) => row.status === "ACTIVE" && row.stage === "INTERVIEW" && !offers.some((offer) => offer.applicationId === row.id));
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  return (
    <>
      {!headOffice && <div style={warningStyle}><strong>Offer terms are Head Office controlled.</strong><span>Branch HR can track offer status for its branch, while compensation values and authorization remain restricted.</span></div>}
      {canManage && headOffice && (
        <form style={panelStyle} onSubmit={onSubmit}>
          <PanelTitle eyebrow="OFFER MANAGEMENT" title="Prepare Employment Offer" subtitle="Offers require a completed interview and follow Draft → Pending Approval → Approved → Issued → Accepted/Declined." />
          <div style={formGridStyle}>
            <Field label="Interview-stage Application"><select value={form.applicationId} onChange={(e) => set("applicationId", e.target.value)} required style={inputStyle}><option value="">Select application</option>{eligible.map((row) => <option key={row.id} value={row.id}>{row.applicationNumber} · {row.firstName} {row.lastName} · {row.vacancyTitle}</option>)}</select></Field>
            <Field label="Currency"><input value={form.currency} onChange={(e) => set("currency", e.target.value)} required style={inputStyle} /></Field>
            <Field label="Gross Monthly Pay"><input type="number" min="1" step="0.01" value={form.grossMonthly} onChange={(e) => set("grossMonthly", e.target.value)} required style={inputStyle} /></Field>
            <Field label="Proposed Start Date"><input type="date" value={form.proposedStartDate} onChange={(e) => set("proposedStartDate", e.target.value)} style={inputStyle} /></Field>
            <Field label="Offer Expiry Date"><input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} style={inputStyle} /></Field>
          </div>
          <Field label="Offer Notes"><textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} style={textareaStyle} /></Field>
          <button type="submit" disabled={saving || eligible.length === 0} style={primaryButtonStyle}><FaFileSignature /> Prepare Draft Offer</button>
        </form>
      )}
      <Register title="Offer Register" empty="No offers in this operating context." columns={["Offer", "Candidate", "Vacancy", "Terms", "Status", "Actions"]} loading={loading} rows={offers.map((row) => [
        row.offerNumber,
        <CellMain key="a" title={`${row.firstName} ${row.lastName}`} subtitle={row.applicationNumber} />,
        row.vacancyTitle,
        row.compensationRestricted ? "Restricted to Head Office" : `${row.currency} ${Number(row.grossMonthly || 0).toLocaleString("en-NG")} / month`,
        <Status key="b" status={row.status} />,
        canManage && headOffice ? <OfferActions key="c" row={row} saving={saving} onAction={onAction} /> : "—",
      ])} />
    </>
  );
}

function OfferActions({ row, saving, onAction }) {
  const actions = row.status === "DRAFT" ? ["submit", "withdraw"]
    : row.status === "PENDING_APPROVAL" ? ["approve", "withdraw"]
      : row.status === "APPROVED" ? ["issue", "withdraw"]
        : row.status === "ISSUED" ? ["accept", "decline", "withdraw"] : [];
  return <div style={actionWrapStyle}>{actions.map((action) => <button type="button" disabled={saving} key={action} style={action === "withdraw" || action === "decline" ? miniDangerButtonStyle : miniButtonStyle} onClick={() => onAction(row, action)}>{friendly(action)}</button>)}</div>;
}

function TalentPoolWorkspace({ candidates, canManage, loading, onPool }) {
  return <Register title="Reusable Talent Pool" empty="No candidates are currently available in the Talent Pool." columns={["Candidate", "Contact", "Source", "Applications", "Notes", "Actions"]} loading={loading} rows={candidates.map((row) => [
    <CellMain key="a" title={`${row.firstName} ${row.lastName}`} subtitle={row.candidateNumber} />,
    <CellMain key="b" title={row.email} subtitle={row.phone || "—"} />,
    friendly(row.source),
    row.applicationCount,
    row.talentPoolNotes || "—",
    canManage ? <button key="c" type="button" style={miniDangerButtonStyle} onClick={() => onPool(row, "ARCHIVED")}>Archive</button> : "—",
  ])} />;
}

function Register({ title, empty, columns, rows, loading }) {
  return (
    <div style={panelStyle}>
      <PanelTitle eyebrow="LIVE REGISTER" title={title} subtitle="Records shown respect the active CHRiS operating-location context." />
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead><tr>{columns.map((column) => <th key={column} style={thStyle}>{column}</th>)}</tr></thead>
          <tbody>
            {!loading && rows.length === 0 && <tr><td colSpan={columns.length} style={emptyCellStyle}>{empty}</td></tr>}
            {rows.map((cells, index) => <tr key={index}>{cells.map((cell, cellIndex) => <td key={cellIndex} style={tdStyle}>{cell}</td>)}</tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PanelTitle({ eyebrow, title, subtitle }) {
  return <div><div style={eyebrowStyle}>{eyebrow}</div><h2 style={sectionTitleStyle}>{title}</h2>{subtitle && <p style={panelSubtitleStyle}>{subtitle}</p>}</div>;
}

function Field({ label, children }) {
  return <label style={labelStyle}><span>{label}</span>{children}</label>;
}

function Metric({ label, value }) {
  return <div style={metricStyle}><div style={metricLabelStyle}>{label}</div><div style={metricValueStyle}>{value === "…" ? "…" : Number(value || 0).toLocaleString("en-NG")}</div></div>;
}

function CellMain({ title, subtitle }) {
  return <div><strong>{title}</strong>{subtitle && <div style={subtleStyle}>{subtitle}</div>}</div>;
}

function Status({ status }) {
  const normalized = String(status || "").toUpperCase();
  const success = ["PUBLISHED","COMPLETED","HIRED","ACCEPTED","APPROVED"].includes(normalized);
  const warning = ["DRAFT","SCREENING","SHORTLISTED","INTERVIEW","OFFER","PENDING_APPROVAL","ISSUED","SCHEDULED"].includes(normalized);
  const danger = ["REJECTED","DECLINED","WITHDRAWN","CANCELLED","NO_SHOW"].includes(normalized);
  return <span style={{ ...statusBaseStyle, color: danger ? "var(--chris-danger)" : warning ? "var(--chris-warning)" : success ? "var(--chris-success)" : "var(--chris-text-main)", borderColor: danger ? "rgba(251,113,133,.35)" : warning ? "rgba(246,211,101,.30)" : success ? "rgba(52,211,153,.30)" : "var(--chris-border-soft)" }}>{friendly(status)}</span>;
}

function friendly(value) {
  if (!value) return "—";
  return String(value).replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

function descriptionFor(mode) {
  if (mode === "ats") return "Track every vacancy application through a controlled, auditable recruitment pipeline.";
  if (mode === "interviews") return "Schedule interview rounds, capture outcomes and preserve decision evidence.";
  if (mode === "offers") return "Prepare and authorize employment offers without bypassing Head Office controls.";
  if (mode === "talent-pool") return "Retain suitable candidates for future vacancies without duplicating candidate identities.";
  return "Create reusable candidate identities, attach applications to published vacancies and maintain candidate history.";
}

const pageStyle = { padding: 24, display: "grid", gap: 18, color: "var(--chris-text-main)", fontFamily: "var(--chris-font-family)" };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" };
const headerActionsStyle = { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" };
const linkButtonStyle = { border: "none", background: "transparent", color: "var(--chris-gold-bright)", fontWeight: 800, cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 7 };
const eyebrowStyle = { color: "var(--chris-success)", fontSize: "var(--chris-font-xs)", fontWeight: 900, letterSpacing: ".12em", textTransform: "uppercase" };
const titleStyle = { margin: "6px 0", fontSize: "var(--chris-font-2xl)", color: "var(--chris-text-main)" };
const subtitleStyle = { margin: 0, maxWidth: 800, color: "var(--chris-text-secondary)" };
const scopePillStyle = { padding: "8px 11px", borderRadius: "var(--chris-radius-pill)", border: "1px solid var(--chris-border-gold)", background: "rgba(212,175,55,.08)", color: "var(--chris-gold-bright)", fontSize: 11, fontWeight: 900 };
const navStripStyle = { display: "flex", gap: 8, flexWrap: "wrap", padding: 10, border: "1px solid var(--chris-border-soft)", borderRadius: "var(--chris-radius-md)", background: "var(--chris-panel-bg-soft)" };
const tabStyle = { border: "1px solid var(--chris-border-soft)", borderRadius: 8, padding: "8px 11px", background: "var(--chris-input-bg)", color: "var(--chris-text-secondary)", fontWeight: 800 };
const activeTabStyle = { ...tabStyle, borderColor: "var(--chris-border-gold)", color: "var(--chris-gold-bright)", background: "rgba(212,175,55,.10)" };
const metricsStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 };
const metricStyle = { background: "var(--chris-panel-bg)", border: "1px solid var(--chris-border-gold)", borderRadius: "var(--chris-radius-card)", padding: 16, boxShadow: "var(--chris-shadow-soft)" };
const metricLabelStyle = { fontSize: 11, fontWeight: 900, color: "var(--chris-text-secondary)", textTransform: "uppercase" };
const metricValueStyle = { marginTop: 8, fontSize: 25, fontWeight: 900, color: "var(--chris-gold-bright)" };
const panelStyle = { background: "var(--chris-panel-bg)", border: "1px solid var(--chris-border-gold)", borderRadius: "var(--chris-radius-card)", padding: 18, boxShadow: "var(--chris-shadow-card)", display: "grid", gap: 14 };
const sectionTitleStyle = { margin: "5px 0 0", fontSize: 20, color: "var(--chris-text-main)" };
const panelSubtitleStyle = { margin: "6px 0 0", color: "var(--chris-text-secondary)", fontSize: 12, lineHeight: 1.5 };
const formGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 };
const labelStyle = { display: "grid", gap: 6, color: "var(--chris-text-secondary)", fontSize: 12, fontWeight: 800 };
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid var(--chris-border-soft)", borderRadius: 9, padding: "10px 11px", font: "inherit", background: "var(--chris-input-bg)", color: "var(--chris-text-main)", colorScheme: "dark" };
const textareaStyle = { ...inputStyle, resize: "vertical", minHeight: 86 };
const consentStyle = { display: "flex", alignItems: "center", gap: 8, color: "var(--chris-text-secondary)", fontSize: 12, fontWeight: 700 };
const primaryButtonStyle = { justifySelf: "start", border: "1px solid var(--chris-gold-deep)", borderRadius: 9, padding: "10px 14px", background: "var(--chris-gold)", color: "var(--chris-page-bg-deep)", fontWeight: 900, display: "inline-flex", alignItems: "center", gap: 8 };
const secondaryButtonStyle = { border: "1px solid var(--chris-border-gold)", borderRadius: 9, padding: "9px 12px", background: "var(--chris-input-bg)", color: "var(--chris-text-main)", fontWeight: 800, display: "inline-flex", alignItems: "center", gap: 7 };
const warningStyle = { padding: 13, borderRadius: 10, border: "1px solid rgba(246,211,101,.28)", background: "rgba(246,211,101,.07)", color: "var(--chris-warning)", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 12 };
const errorStyle = { padding: 12, borderRadius: 9, border: "1px solid rgba(251,113,133,.30)", background: "rgba(251,113,133,.08)", color: "var(--chris-danger)", fontWeight: 700 };
const successStyle = { padding: 12, borderRadius: 9, border: "1px solid rgba(52,211,153,.30)", background: "rgba(52,211,153,.08)", color: "var(--chris-success)", fontWeight: 700 };
const tableStyle = { width: "100%", borderCollapse: "collapse", minWidth: 900 };
const thStyle = { padding: "10px 9px", textAlign: "left", borderBottom: "1px solid var(--chris-border-gold)", fontSize: 11, color: "var(--chris-gold-bright)", textTransform: "uppercase" };
const tdStyle = { padding: "11px 9px", borderBottom: "1px solid var(--chris-border-soft)", verticalAlign: "top", fontSize: 12, color: "var(--chris-text-main)" };
const subtleStyle = { marginTop: 4, color: "var(--chris-text-muted)", fontSize: 11 };
const emptyCellStyle = { ...tdStyle, textAlign: "center", padding: 28, color: "var(--chris-text-muted)" };
const actionWrapStyle = { display: "flex", flexWrap: "wrap", gap: 6 };
const miniButtonStyle = { border: "1px solid var(--chris-border-gold)", borderRadius: 7, padding: "6px 8px", background: "var(--chris-input-bg)", color: "var(--chris-gold-bright)", fontSize: 10, fontWeight: 800 };
const miniDangerButtonStyle = { ...miniButtonStyle, color: "var(--chris-danger)", borderColor: "rgba(251,113,133,.32)" };
const stageGridStyle = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(125px, 1fr))", gap: 8 };
const stageCardStyle = { background: "var(--chris-panel-bg)", border: "1px solid var(--chris-border-soft)", borderRadius: 10, padding: 12, display: "grid", gap: 4 };
const statusBaseStyle = { display: "inline-block", padding: "5px 8px", borderRadius: 999, fontSize: 10, fontWeight: 900, border: "1px solid var(--chris-border-soft)", background: "var(--chris-input-bg)" };

export default RecruitmentTalentWorkspace;
