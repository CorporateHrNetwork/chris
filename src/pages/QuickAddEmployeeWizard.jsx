import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest, getStoredOrganization } from "../services/api";
import "./QuickAddEmployeeWizard.css";

const STEPS = [
  "Personal Information",
  "Employment Information",
  "Organization Placement",
  "Review & Create",
];

export function tenantLocalDate(timezone = "Africa/Lagos", now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

const initialForm = () => ({
  firstName: "",
  middleName: "",
  surname: "",
  gender: "",
  phone: "",
  email: "",
  status: "Probation",
  hireDate: tenantLocalDate(
    getStoredOrganization()?.timezone || "Africa/Lagos"
  ),
  departmentId: "",
  designationId: "",
  locationId: "",
});

export default function QuickAddEmployeeWizard() {
  const navigate = useNavigate();
  const panelRef = useRef(null);
  const fieldRefs = useRef({});
  const successTimer = useRef(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState([]);
  const [locations, setLocations] = useState([]);
  const [createdEmployee, setCreatedEmployee] = useState(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest("/api/employees/career/departments"),
      apiRequest("/api/employees/career/catalog"),
      apiRequest("/api/location-catalog"),
    ])
      .then(([departmentResult, designationResult, locationResult]) => {
        if (cancelled) return;
        setDepartments((departmentResult.data || []).filter((row) => row.isActive !== false));
        setDesignations((designationResult.data || []).filter(
          (row) => row.isActive !== false && row.departmentId
        ));
        setLocations((locationResult.data || []).filter((row) => row.isActive !== false));
      })
      .catch((error) => {
        if (!cancelled) {
          setServerError(
            error.message || "Unable to load the organization structure."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      if (successTimer.current) window.clearTimeout(successTimer.current);
    };
  }, []);

  const availableDesignations = useMemo(
    () =>
      designations.filter(
        (designation) => designation.departmentId === form.departmentId
      ),
    [designations, form.departmentId]
  );
  const selectedDepartment = departments.find((row) => row.id === form.departmentId);
  const selectedDesignation = designations.find((row) => row.id === form.designationId);
  const selectedLocation = locations.find((row) => row.id === form.locationId);
  const fullName = [form.firstName, form.middleName, form.surname]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(" ");

  const change = (field) => (event) => {
    const value = event.target.value;
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === "departmentId" ? { designationId: "" } : {}),
    }));
    setErrors((current) => ({ ...current, [field]: "" }));
    setServerError("");
  };

  function errorsFor(targetStep) {
    const next = {};
    if (targetStep === 0) {
      if (!form.firstName.trim()) next.firstName = "First Name is required.";
      if (!form.surname.trim()) next.surname = "Surname is required.";
      if (!form.gender) next.gender = "Select the employee's gender.";
      if (!form.phone.trim()) next.phone = "Phone is required.";
      if (!form.email.trim()) next.email = "Email is required.";
    }
    if (targetStep === 1) {
      if (!["Active", "Probation"].includes(form.status)) {
        next.status = "Select a valid initial employment status.";
      }
      if (!form.hireDate) next.hireDate = "Hire Date is required.";
    }
    if (targetStep === 2) {
      if (!form.departmentId) next.departmentId = "Select a Department.";
      if (!form.designationId) next.designationId = "Select a Designation.";
      if (!Number.isInteger(selectedDesignation?.careerLevel)) {
        next.designationId =
          "This Designation has no Employment Level. Configure its career level before continuing.";
      }
      if (!form.locationId) next.locationId = "Select a Work Location.";
    }
    return next;
  }

  function revealErrors(targetStep, nextErrors) {
    setStep(targetStep);
    setErrors(nextErrors);
    const firstField = Object.keys(nextErrors)[0];
    window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      fieldRefs.current[firstField]?.focus();
    }, 0);
  }

  function next() {
    const nextErrors = errorsFor(step);
    if (Object.keys(nextErrors).length) {
      revealErrors(step, nextErrors);
      return;
    }
    setErrors({});
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  function back() {
    setErrors({});
    setServerError("");
    setStep((current) => Math.max(current - 1, 0));
  }

  async function submit() {
    for (let targetStep = 0; targetStep < 3; targetStep += 1) {
      const nextErrors = errorsFor(targetStep);
      if (Object.keys(nextErrors).length) {
        revealErrors(targetStep, nextErrors);
        return;
      }
    }

    try {
      setBusy(true);
      setServerError("");
      const result = await apiRequest("/api/employees", {
        method: "POST",
        body: {
          name: fullName,
          departmentId: form.departmentId,
          designationId: form.designationId,
          locationId: form.locationId,
          email: form.email,
          phone: form.phone,
          gender: form.gender,
          status: form.status,
          hireDate: form.hireDate,
        },
      });
      setCreatedEmployee(result.data);
      successTimer.current = window.setTimeout(() => {
        setCreatedEmployee(null);
        successTimer.current = null;
      }, 7500);
    } catch (error) {
      setServerError(error.message || "Unable to create employee.");
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      setBusy(false);
    }
  }

  function follow(path) {
    if (successTimer.current) window.clearTimeout(successTimer.current);
    setCreatedEmployee(null);
    navigate(path);
  }

  return (
    <section className="qa-page">
      <header className="qa-header">
        <div><b>EMPLOYEE ENTRY · QUICK ADD</b><h1>Add Employee</h1></div>
        <button type="button" className="qa-secondary" onClick={() => navigate("/employees/add")}>Change mode</button>
      </header>

      {createdEmployee && (
        <section className="qa-success" role="status">
          <div><strong>Employee created successfully — {createdEmployee.employeeNumber} {[createdEmployee.firstName, createdEmployee.middleName, createdEmployee.lastName].filter(Boolean).join(" ")}</strong><p>The authoritative employee record and Episode 1 committed successfully.</p></div>
          <div className="qa-actions">
            <button type="button" className="qa-secondary" onClick={() => follow(`/employees/${createdEmployee.employeeNumber}`)}>View Employee Profile</button>
            <button type="button" className="qa-primary" onClick={() => follow(`/employees/${encodeURIComponent(createdEmployee.employeeNumber)}/onboarding`)}>Continue Onboarding</button>
            <button type="button" className="qa-dismiss" aria-label="Dismiss employee creation confirmation" onClick={() => setCreatedEmployee(null)}>×</button>
          </div>
        </section>
      )}

      <nav className="qa-steps" aria-label="Quick Add progress">
        {STEPS.map((label, index) => (
          <button key={label} type="button" className={index === step ? "active" : index < step ? "complete" : ""} onClick={() => index < step && setStep(index)}>
            <span>{index + 1}</span>{label}
          </button>
        ))}
      </nav>

      <section className="qa-panel" ref={panelRef}>
        <div className="qa-panel-title"><div><small>STEP {step + 1} OF 4</small><h2>{STEPS[step]}</h2></div>{loading && <span>Loading organization structure…</span>}</div>
        {serverError && <div className="qa-error" role="alert">{serverError}</div>}

        {step === 0 && <div className="qa-grid">
          <Field label="First Name" error={errors.firstName}><input ref={(node) => { fieldRefs.current.firstName = node; }} value={form.firstName} onChange={change("firstName")} /></Field>
          <Field label="Middle Name" required={false}><input value={form.middleName} onChange={change("middleName")} /></Field>
          <Field label="Surname" error={errors.surname}><input ref={(node) => { fieldRefs.current.surname = node; }} value={form.surname} onChange={change("surname")} /></Field>
          <Field label="Gender" error={errors.gender}><select ref={(node) => { fieldRefs.current.gender = node; }} value={form.gender} onChange={change("gender")}><option value="">Select gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option><option value="Unspecified">Prefer not to specify</option></select></Field>
          <Field label="Phone" error={errors.phone}><input ref={(node) => { fieldRefs.current.phone = node; }} type="tel" value={form.phone} onChange={change("phone")} /></Field>
          <Field label="Email" error={errors.email}><input ref={(node) => { fieldRefs.current.email = node; }} type="email" value={form.email} onChange={change("email")} /></Field>
        </div>}

        {step === 1 && <div className="qa-grid">
          <Field label="Employment Status" error={errors.status}><select ref={(node) => { fieldRefs.current.status = node; }} value={form.status} onChange={change("status")}><option value="Probation">Probation</option><option value="Active">Active</option></select></Field>
          <Field label="Hire / Start Date" error={errors.hireDate}><input ref={(node) => { fieldRefs.current.hireDate = node; }} type="date" value={form.hireDate} onChange={change("hireDate")} /></Field>
        </div>}

        {step === 2 && <div className="qa-grid">
          <Field label="Department" error={errors.departmentId}><select ref={(node) => { fieldRefs.current.departmentId = node; }} value={form.departmentId} onChange={change("departmentId")} disabled={loading}><option value="">Select department</option>{departments.map((row) => <option key={row.id} value={row.id}>{row.name}{row.code ? ` (${row.code})` : ""}</option>)}</select></Field>
          <Field label="Designation" error={errors.designationId}><select ref={(node) => { fieldRefs.current.designationId = node; }} value={form.designationId} onChange={change("designationId")} disabled={loading || !form.departmentId}><option value="">{form.departmentId ? "Select designation" : "Select department first"}</option>{availableDesignations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field>
          <Field label="Employment Level" required={false}><input value={Number.isInteger(selectedDesignation?.careerLevel) ? `Level ${selectedDesignation.careerLevel} — derived from Designation` : form.designationId ? "Employment Level mapping required" : "Select a Designation"} readOnly aria-readonly="true" /></Field>
          <Field label="Work Location" error={errors.locationId}><select ref={(node) => { fieldRefs.current.locationId = node; }} value={form.locationId} onChange={change("locationId")} disabled={loading}><option value="">Select work location</option>{locations.map((row) => <option key={row.id} value={row.id}>{row.name}{row.city ? ` — ${row.city}` : ""}</option>)}</select></Field>
        </div>}

        {step === 3 && <div className="qa-review">
          <Review title="Personal" rows={[["Name", fullName], ["Gender", form.gender], ["Phone", form.phone], ["Email", form.email]]} />
          <Review title="Employment" rows={[["Status", form.status], ["Hire Date", form.hireDate]]} />
          <Review title="Organization" rows={[["Department", selectedDepartment?.name], ["Designation", selectedDesignation?.name], ["Employment Level", Number.isInteger(selectedDesignation?.careerLevel) ? `Level ${selectedDesignation.careerLevel}` : "Not configured"], ["Work Location", selectedLocation?.name]]} />
        </div>}

        <footer className="qa-footer">
          <button type="button" className="qa-secondary" onClick={step ? back : () => navigate("/employees/add")} disabled={busy}>{step ? "Back to edit" : "Back"}</button>
          {step < 3 ? <button type="button" className="qa-primary" onClick={next} disabled={loading}>Next</button> : <button type="button" className="qa-primary" onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create Employee"}</button>}
        </footer>
      </section>
    </section>
  );
}

function Field({ label, error, required = true, children }) {
  return <label className="qa-field"><span>{label} {required && <b>*</b>}</span>{children}{error && <small>{error}</small>}</label>;
}

function Review({ title, rows }) {
  return <article><h3>{title}</h3>{rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || "—"}</strong></div>)}</article>;
}
