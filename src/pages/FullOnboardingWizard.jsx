import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import OnboardingSectionDataForm from "../components/employees/OnboardingSectionDataForm";
import SearchableRegistrySelect from "../components/common/SearchableRegistrySelect";
import { COUNTRY_CATALOG } from "../data/countryCatalog";
import { apiRequest, getStoredOrganization } from "../services/api";
import { tenantLocalDate } from "./QuickAddEmployeeWizard";
import { runFullOnboarding } from "../utils/fullOnboardingOrchestration";
import "./QuickAddEmployeeWizard.css";
import "./FullOnboardingWizard.css";

const STEPS = [
  "Personal Information",
  "Employment Information",
  "Organization Placement",
  "Compensation / Payment Setup",
  "Statutory Information",
  "Documents",
  "Onboarding Checklist",
  "Review & Create",
];
const DOCUMENT_TYPES = [
  ["CV_RESUME", "CV / Resume"],
  ["OFFER_APPOINTMENT", "Offer / Appointment Letter"],
  ["VALID_ID", "Valid ID"],
  ["CERTIFICATES", "Certificates"],
  ["PASSPORT_PHOTO", "Passport Photograph"],
  ["OTHER", "Other Required Document"],
];

const initialForm = () => ({
  firstName: "", middleName: "", surname: "", gender: "", phone: "", email: "",
  dateOfBirth: "", maritalStatus: "", nationality: "Nigeria", residentialAddress: "",
  status: "Probation", hireDate: tenantLocalDate(getStoredOrganization()?.timezone || "Africa/Lagos"),
  employmentType: "Permanent", templateId: "", departmentId: "", designationId: "", locationId: "",
});

export default function FullOnboardingWizard() {
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const successTimer = useRef(null);
  const uploadedDocumentIds = useRef(new Set());
  const completedSectionKeys = useRef(new Set());
  const completedTaskKeys = useRef(new Set());
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [payment, setPayment] = useState({ payrollCurrency: "NGN", paymentMethod: "Bank Transfer" });
  const [statutory, setStatutory] = useState({});
  const [documents, setDocuments] = useState([]);
  const [documentDraft, setDocumentDraft] = useState({ category: "CV_RESUME", file: null, notes: "" });
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [taskOwners, setTaskOwners] = useState([]);
  const [taskDrafts, setTaskDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createdEmployee, setCreatedEmployee] = useState(null);
  const [onboardingRecord, setOnboardingRecord] = useState(null);
  const [complete, setComplete] = useState(false);
  const [completionEmployee, setCompletionEmployee] = useState(null);
  const [operationPhase, setOperationPhase] = useState("DRAFT");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest("/api/employees/career/departments"),
      apiRequest("/api/employees/career/catalog"),
      apiRequest("/api/location-catalog"),
      apiRequest("/api/employees/onboarding/templates"),
      apiRequest("/api/employees/onboarding/task-owners"),
    ]).then(([departmentResult, designationResult, locationResult, templateResult, ownerResult]) => {
      if (cancelled) return;
      setDepartments((departmentResult.data || []).filter((row) => row.isActive !== false));
      setDesignations((designationResult.data || []).filter((row) => row.isActive !== false && row.departmentId));
      setLocations((locationResult.data || []).filter((row) => row.isActive !== false));
      const activeTemplates = (templateResult.data || []).filter((row) => row.isActive !== false);
      setTemplates(activeTemplates);
      setTaskOwners(ownerResult.data || []);
      setForm((current) => ({ ...current, templateId: current.templateId || activeTemplates[0]?.id || "" }));
    }).catch((failure) => setError(failure.message || "Unable to load onboarding setup."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      if (successTimer.current) window.clearTimeout(successTimer.current);
    };
  }, []);

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const availableDesignations = useMemo(() => designations.filter(
    (designation) => designation.departmentId === form.departmentId
  ), [designations, form.departmentId]);
  const matchingTemplates = useMemo(() => {
    const matching = templates.filter((template) => !template.employmentType ||
      String(template.employmentType).toLowerCase() === form.employmentType.toLowerCase());
    return matching.length ? matching : templates;
  }, [templates, form.employmentType]);
  const designation = designations.find((row) => row.id === form.designationId);
  const template = templates.find((row) => row.id === form.templateId);
  const fullName = [form.firstName, form.middleName, form.surname].map((value) => value.trim()).filter(Boolean).join(" ");

  function set(field) {
    return (event) => {
      const value = event.target.value;
      setForm((current) => ({
        ...current, [field]: value,
        ...(field === "departmentId" ? { designationId: "" } : {}),
        ...(field === "employmentType" ? { templateId: "" } : {}),
      }));
      setError("");
    };
  }

  function validationFor(targetStep) {
    if (targetStep === 0 && (!form.firstName.trim() || !form.surname.trim() || !form.gender || !form.phone.trim() || !form.email.trim())) return "Complete First Name, Surname, Gender, Phone and Email.";
    if (targetStep === 1 && (!form.hireDate || !["Active", "Probation"].includes(form.status))) return "Select a valid initial status and Hire Date.";
    if (targetStep === 1 && !form.templateId) return "Select an active onboarding workflow.";
    if (targetStep === 2 && (!form.departmentId || !form.designationId || !form.locationId)) return "Select Department, Designation and Work Location.";
    if (targetStep === 2 && !Number.isInteger(designation?.careerLevel)) return "The selected Designation has no Employment Level. Configure its career level before continuing.";
    return "";
  }

  function goNext() {
    const message = validationFor(step);
    if (message) { setError(message); panelRef.current?.focus(); return; }
    setError("");
    setStep((current) => Math.min(current + 1, 7));
  }

  function addDocument() {
    if (!documentDraft.file) { setError("Choose a document file before adding it."); return; }
    setDocuments((current) => [...current, { ...documentDraft, id: `${Date.now()}-${documentDraft.file.name}` }]);
    setDocumentDraft({ category: "CV_RESUME", file: null, notes: "" });
    setError("");
  }

  function resetWizardDraft() {
    setStep(0);
    setForm({ ...initialForm(), templateId: templates[0]?.id || "" });
    setPayment({ payrollCurrency: "NGN", paymentMethod: "Bank Transfer" });
    setStatutory({});
    setDocuments([]);
    setDocumentDraft({ category: "CV_RESUME", file: null, notes: "" });
    setTaskDrafts({});
    setCreatedEmployee(null);
    setOnboardingRecord(null);
    completedSectionKeys.current = new Set();
    completedTaskKeys.current = new Set();
    uploadedDocumentIds.current = new Set();
  }

  async function submit() {
    for (let index = 0; index < 3; index += 1) {
      const message = validationFor(index);
      if (message) { setStep(index); setError(message); return; }
    }
    setBusy(true);
    setError("");
    try {
      const result = await runFullOnboarding({
        apiRequest,
        employee: createdEmployee,
        onboardingRecord,
        employeePayload: {
          name: fullName, departmentId: form.departmentId, designationId: form.designationId,
          locationId: form.locationId, email: form.email, phone: form.phone,
          gender: form.gender, status: form.status, hireDate: form.hireDate,
        },
        templateId: form.templateId,
        sectionPayloads: [
          { key: "personal-details", data: { fullName, email: form.email, phone: form.phone, gender: form.gender, dateOfBirth: form.dateOfBirth, maritalStatus: form.maritalStatus, nationality: form.nationality, residentialAddress: form.residentialAddress } },
          { key: "payment-details", data: payment },
          { key: "statutory-details", data: statutory },
        ],
        documents,
        completedSectionKeys: completedSectionKeys.current,
        uploadedDocumentIds: uploadedDocumentIds.current,
        taskUpdates: checklistItems.map((item) => ({
          itemKey: item.itemKey,
          data: {
            status: taskDrafts[item.itemKey]?.status || "NOT_STARTED",
            ownerUserId: taskDrafts[item.itemKey]?.ownerUserId || null,
            dueDate: taskDrafts[item.itemKey]?.dueDate || null,
            notes: taskDrafts[item.itemKey]?.notes || null,
          },
        })),
        completedTaskKeys: completedTaskKeys.current,
        onEmployeeCreated: (employee) => { setCreatedEmployee(employee); setOperationPhase("EMPLOYEE_CREATED"); },
        onOnboardingStarted: (record) => { setOnboardingRecord(record); setOperationPhase("ONBOARDING_STARTED"); },
        onOnboardingUpdated: setOnboardingRecord,
      });
      setCompletionEmployee({ ...result.employee, displayName: fullName });
      setOperationPhase("COMPLETE");
      setComplete(true);
      resetWizardDraft();
      successTimer.current = window.setTimeout(() => { setComplete(false); successTimer.current = null; }, 8000);
    } catch (failure) {
      const recovery = failure.onboardingRecovery || {};
      if (recovery.employee) setCreatedEmployee(recovery.employee);
      if (recovery.onboardingRecord) setOnboardingRecord(recovery.onboardingRecord);
      setOperationPhase(recovery.phase || "DRAFT");
      setError(recovery.employee
        ? `Employee created — complete onboarding. ${failure.message || "The remaining onboarding operation could not be completed."} Employee creation will not run again.`
        : failure.message || "Unable to create employee and start onboarding.");
    } finally {
      setBusy(false);
    }
  }

  const follow = (path) => { if (successTimer.current) window.clearTimeout(successTimer.current); setComplete(false); navigate(path); };
  const addAnother = () => {
    if (successTimer.current) window.clearTimeout(successTimer.current);
    setComplete(false);
    setCompletionEmployee(null);
    setOperationPhase("DRAFT");
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const sections = Array.isArray(template?.sections) ? template.sections : [];
  const checklistItems = sections.flatMap((section, sectionIndex) =>
    (section.items || []).map((title, itemIndex) => ({
      itemKey: `${section.key || `section-${sectionIndex + 1}`}:${itemIndex + 1}`,
      title,
      category: section.label || section.key,
      isRequired: section.required !== false,
    }))
  );
  const incomplete = [!payment.accountNumber && "Payment setup", !statutory.taxIdentificationNumber && "TIN/PAYE readiness", !documents.length && "Documents"].filter(Boolean);

  return <section className="qa-page fo-page" data-operation-phase={operationPhase}>
    <header className="qa-header"><div><b>EMPLOYEE ENTRY · FULL ONBOARDING</b><h1>Add & Onboard Employee</h1></div><button className="qa-secondary" type="button" onClick={() => navigate("/employees/add")}>Change mode</button></header>
    {complete && completionEmployee && <section className="qa-success" role="status"><div><strong>Employee created and onboarding started successfully — {completionEmployee.employeeNumber} {completionEmployee.displayName || completionEmployee.name}</strong><p>The completed draft has been cleared.</p></div><div className="qa-actions"><button className="qa-primary" type="button" onClick={() => follow(`/employees/${encodeURIComponent(completionEmployee.employeeNumber)}`)}>View Employee</button><button className="qa-secondary" type="button" onClick={() => follow("/employees/onboarding")}>Onboarding Tracker</button><button className="qa-secondary" type="button" onClick={addAnother}>Add Another Employee</button></div></section>}
    <nav className="qa-steps fo-steps" aria-label="Full Onboarding progress">{STEPS.map((label, index) => <button key={label} type="button" className={step === index ? "active" : index < step ? "complete" : ""} onClick={() => index < step && setStep(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    <section className="qa-panel" ref={panelRef} tabIndex="-1">
      <div className="qa-panel-title"><div><small>STEP {step + 1} OF 8</small><h2>{STEPS[step]}</h2></div>{loading && <span>Loading onboarding setup…</span>}</div>
      {error && <div className="qa-error" role="alert">{error}</div>}
      {createdEmployee && !complete && <div className="fo-note" role="status"><strong>Employee created successfully — {createdEmployee.employeeNumber} {createdEmployee.name || fullName}</strong><span>Continue the remaining onboarding operation. The employee record will not be created again.</span></div>}
      {error && createdEmployee && !complete && <div className="qa-actions fo-recovery"><button className="qa-secondary" type="button" onClick={() => follow(`/employees/${encodeURIComponent(createdEmployee.employeeNumber)}/onboarding`)}>Continue Onboarding</button><button className="qa-secondary" type="button" onClick={() => follow(`/employees/${createdEmployee.employeeNumber}`)}>View created Employee</button></div>}
      {step === 0 && <div className="qa-grid"><Field label="First Name"><input value={form.firstName} onChange={set("firstName")} /></Field><Field label="Middle Name" optional><input value={form.middleName} onChange={set("middleName")} /></Field><Field label="Surname"><input value={form.surname} onChange={set("surname")} /></Field><Field label="Gender"><select value={form.gender} onChange={set("gender")}><option value="">Select gender</option><option>Male</option><option>Female</option><option>Other</option><option>Unspecified</option></select></Field><Field label="Phone"><input type="tel" value={form.phone} onChange={set("phone")} /></Field><Field label="Email"><input type="email" value={form.email} onChange={set("email")} /></Field><Field label="Date of Birth" optional><input type="date" value={form.dateOfBirth} onChange={set("dateOfBirth")} /></Field><Field label="Marital Status" optional><select value={form.maritalStatus} onChange={set("maritalStatus")}><option value="">Select status</option><option>Single</option><option>Married</option><option>Divorced</option><option>Widowed</option></select></Field><Field label="Nationality" optional><SearchableRegistrySelect ariaLabel="Nationality" value={form.nationality} options={COUNTRY_CATALOG.map((country) => ({ value: country.code, label: country.name }))} onChange={(value) => { setForm((current) => ({ ...current, nationality: value })); setError(""); }} placeholder="Search country / nationality" /></Field><Field label="Residential Address" optional><textarea rows="2" value={form.residentialAddress} onChange={set("residentialAddress")} /></Field></div>}
      {step === 1 && <div className="qa-grid"><Field label="Employment Status"><select value={form.status} onChange={set("status")}><option>Probation</option><option>Active</option></select></Field><Field label="Hire / Start Date"><input type="date" value={form.hireDate} onChange={set("hireDate")} /></Field><Field label="Employment Type"><select value={form.employmentType} onChange={set("employmentType")}><option>Permanent</option><option>Contract</option><option>Temporary</option><option>Probation</option><option>Intern / Trainee</option><option>Expatriate</option><option>Casual</option></select></Field><Field label="Onboarding Workflow"><select value={form.templateId} onChange={set("templateId")}><option value="">Select active workflow</option>{matchingTemplates.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field></div>}
      {step === 2 && <div className="qa-grid"><Field label="Department"><select value={form.departmentId} onChange={set("departmentId")}><option value="">Select department</option>{departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label="Designation"><select value={form.designationId} onChange={set("designationId")} disabled={!form.departmentId}><option value="">Select designation</option>{availableDesignations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label="Employment Level" optional><input readOnly value={Number.isInteger(designation?.careerLevel) ? `Level ${designation.careerLevel} — derived from Designation` : "Select a mapped Designation"} /></Field><Field label="Work Location"><select value={form.locationId} onChange={set("locationId")}><option value="">Select location</option>{locations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field></div>}
      {step === 3 && <><div className="fo-note"><strong>Payment Setup / Payroll Readiness</strong><span>Salary structures and rates are configured separately when the Payroll module becomes operational.</span></div><OnboardingSectionDataForm sectionKey="payment-details" value={payment} onChange={setPayment} inputStyle={inputStyle} /></>}
      {step === 4 && <><div className="fo-note"><strong>Statutory onboarding readiness</strong><span>Record only confirmed employee information. This is not the statutory-remittance engine.</span></div><OnboardingSectionDataForm sectionKey="statutory-details" countryContext={form.nationality} value={statutory} onChange={setStatutory} inputStyle={inputStyle} textareaStyle={textareaStyle} /></>}
      {step === 5 && <div className="fo-documents"><div className="fo-note"><strong>Submitted documents</strong><span>Files are staged locally and uploaded only after the Employee and Onboarding record exist. Verification status is not fabricated.</span></div><div className="qa-grid"><Field label="Document Type"><select value={documentDraft.category} onChange={(event) => setDocumentDraft((current) => ({ ...current, category: event.target.value }))}>{DOCUMENT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="File"><input type="file" onChange={(event) => setDocumentDraft((current) => ({ ...current, file: event.target.files?.[0] || null }))} /></Field><Field label="Notes" optional><input value={documentDraft.notes} onChange={(event) => setDocumentDraft((current) => ({ ...current, notes: event.target.value }))} /></Field></div><button type="button" className="qa-secondary" onClick={addDocument}>Add staged document</button>{documents.map((item) => <div className="fo-document" key={item.id}><span>{DOCUMENT_TYPES.find(([value]) => value === item.category)?.[1]} · {item.file.name}</span><button type="button" onClick={() => setDocuments((current) => current.filter((row) => row.id !== item.id))}>Remove</button></div>)}</div>}
      {step === 6 && <div className="fo-checklist"><div className="fo-note"><strong>Operational Onboarding Checklist</strong><span>Assignments and dates are staged now and saved to tenant-scoped tasks after onboarding starts. Overdue is derived only from a past due date.</span></div>{checklistItems.map((item) => { const draft = taskDrafts[item.itemKey] || {}; const update = (field, value) => setTaskDrafts((current) => ({ ...current, [item.itemKey]: { ...current[item.itemKey], [field]: value } })); return <article key={item.itemKey} className="fo-task"><div><strong>{item.title}</strong><span>{item.category} · {item.isRequired ? "Required" : "Optional"}</span></div><div className="qa-grid"><Field label="Owner" optional><select value={draft.ownerUserId || ""} onChange={(event) => update("ownerUserId", event.target.value)}><option value="">Unassigned</option>{taskOwners.map((owner) => <option key={owner.id} value={owner.id}>{[owner.firstName, owner.lastName].filter(Boolean).join(" ") || owner.email}</option>)}</select></Field><Field label="Due Date" optional><input type="date" value={draft.dueDate || ""} onChange={(event) => update("dueDate", event.target.value)} /></Field><Field label="Status"><select value={draft.status || "NOT_STARTED"} onChange={(event) => update("status", event.target.value)}><option value="NOT_STARTED">Not Started</option><option value="IN_PROGRESS">In Progress</option><option value="COMPLETED">Completed</option><option value="NOT_APPLICABLE">Not Applicable</option></select></Field><Field label="Notes" optional><input value={draft.notes || ""} onChange={(event) => update("notes", event.target.value)} placeholder={draft.status === "NOT_APPLICABLE" ? "Reason required" : "Task notes"} /></Field></div></article>; })}</div>}
      {step === 7 && <div className="fo-review"><Review title="Personal" rows={[["Name", fullName], ["Gender", form.gender], ["Phone", form.phone], ["Email", form.email], ["Nationality", form.nationality]]}/><Review title="Employment" rows={[["Status", form.status], ["Hire Date", form.hireDate], ["Employment Type", form.employmentType], ["Workflow", template?.name]]}/><Review title="Organization" rows={[["Department", departments.find((row) => row.id === form.departmentId)?.name], ["Designation", designation?.name], ["Employment Level", Number.isInteger(designation?.careerLevel) ? `Level ${designation.careerLevel}` : "Missing"], ["Location", locations.find((row) => row.id === form.locationId)?.name]]}/><Review title="Payment Setup" rows={[["Bank", payment.bankName], ["Account Name", payment.accountName], ["Currency", payment.payrollCurrency], ["Method", payment.paymentMethod]]}/><Review title="Statutory Information" rows={[["TIN", statutory.taxIdentificationNumber], ["PAYE State", statutory.payeState], ["PFA", statutory.pensionPfa], ["RSA PIN", statutory.pensionPin], ["NHIA", statutory.nhiaNumber]]}/><Review title="Documents" rows={[["Staged", `${documents.length} document(s)`]]}/><Review title="Onboarding Checklist" rows={[["Template sections", `${sections.length}`], ["Initial state", "Outstanding until saved/completed"]]}/>{incomplete.length > 0 && <div className="fo-warning"><strong>Incomplete onboarding information</strong><span>{incomplete.join(" · ")}. These remain visible as outstanding after onboarding starts.</span></div>}</div>}
      <footer className="qa-footer"><button type="button" className="qa-secondary" disabled={busy} onClick={() => step ? setStep((current) => current - 1) : navigate("/employees/add")}>{step ? "Back to edit" : "Back"}</button>{step < 7 ? <button type="button" className="qa-primary" disabled={loading} onClick={goNext}>Next</button> : <button type="button" className="qa-primary" disabled={busy} onClick={submit}>{busy ? (createdEmployee ? "Completing onboarding…" : "Creating employee…") : createdEmployee ? "Employee created — complete onboarding" : "Create Employee & Start Onboarding"}</button>}</footer>
    </section>
  </section>;
}

const inputStyle = { width: "100%", minHeight: 43, padding: "0 12px", border: "1px solid #315746", borderRadius: 9, background: "#0d261b", color: "#fff" };
const textareaStyle = { ...inputStyle, minHeight: 72, padding: 10 };
function Field({ label, optional = false, children }) { return <label className="qa-field"><span>{label}{!optional && <b> *</b>}</span>{children}</label>; }
function Review({ title, rows }) { return <article><h3>{title}</h3>{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || "—"}</strong></div>)}</article>; }
