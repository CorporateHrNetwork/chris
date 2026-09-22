import { useEffect, useMemo, useState } from "react";
import EmployeeSearchSelect from "../EmployeeSearchSelect";
import { apiRequest } from "../../services/api";

function value(value) {
  return value == null ? "—" : Number(value).toLocaleString();
}

export default function EmployeeLeaveProfileSelector() {
  const [employeeNumber, setEmployeeNumber] = useState("");
  const [profile, setProfile] = useState(null);
  const [policyId, setPolicyId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadProfile = async (number, nextPolicyId = "") => {
    if (!number) {
      setProfile(null);
      setPolicyId("");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const query = nextPolicyId ? `?policyId=${encodeURIComponent(nextPolicyId)}` : "";
      const result = await apiRequest(`/api/zermatt/leave-profile/${encodeURIComponent(number)}${query}`);
      setProfile(result?.data || null);
      setPolicyId(result?.data?.selectedPolicy?.id || nextPolicyId || "");
    } catch (requestError) {
      setProfile(null);
      setError(requestError?.message || "Unable to load employee leave profile.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (employeeNumber) loadProfile(employeeNumber);
  }, [employeeNumber]);

  const selectedPolicy = useMemo(() => {
    if (!profile) return null;
    return profile.policyOptions?.find((policy) => policy.id === policyId) || profile.selectedPolicy || null;
  }, [profile, policyId]);

  const employee = profile?.employee;
  const employeeDisplayName = [employee?.firstName, employee?.middleName, employee?.lastName].filter(Boolean).join(" ");

  return (
    <section style={panelStyle}>
      <div style={eyebrowStyle}>EMPLOYEE LEAVE PROFILE</div>
      <h3 style={titleStyle}>Select Employee & Leave Policy</h3>
      <p style={helpStyle}>
        Every employee can be selected here. ZERMATT Full-Time entitlement policies auto-populate when a qualifying employee is selected; non-Full-Time employees keep a profile without being granted the Full-Time entitlement set.
      </p>
      <div style={selectorGrid}>
        <EmployeeSearchSelect
          endpoint="/api/zermatt/employee-options"
          label="Employee"
          value={employeeNumber}
          onChange={(next) => { setEmployeeNumber(next); setError(""); }}
          placeholder="Search employee number or name"
        />
        <label style={fieldStyle}>
          <span>Leave Policy</span>
          <select
            style={inputStyle}
            value={policyId}
            onChange={(event) => {
              const next = event.target.value;
              setPolicyId(next);
              if (employeeNumber && next) loadProfile(employeeNumber, next);
            }}
            disabled={!profile?.policyOptions?.length}
          >
            <option value="">Select leave policy</option>
            {(profile?.policyOptions || []).map((policy) => (
              <option key={policy.id} value={policy.id} disabled={!policy.eligible}>
                {policy.name}{policy.eligible ? "" : " · Not eligible"}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div role="alert" style={errorStyle}>{error}</div>}
      {loading && <div style={loadingStyle}>Loading employee leave profile…</div>}

      {profile && !loading && (
        <>
          <div style={identityStyle}>
            <strong>{employee?.employeeNumber} — {employeeDisplayName}</strong>
            <span>{employee?.employmentType || "Employment type not recorded"} · {employee?.designation?.name || "Designation not recorded"} · {employee?.designation?.careerLevel ? `L${employee.designation.careerLevel}` : "Level not mapped"}</span>
          </div>

          {selectedPolicy ? (
            <div style={metricGrid}>
              <Metric label="Entitlement" value={value(selectedPolicy.entitlement)} />
              <Metric label="Used Days" value={value(selectedPolicy.used)} />
              <Metric label="Leave Balance" value={value(selectedPolicy.available)} />
              <Metric label="Committed" value={value(selectedPolicy.committed)} />
              <Metric label="Maximum Requestable" value={value(selectedPolicy.maximumRequestable)} />
              <Metric label="Next Leave Date" value={selectedPolicy.nextLeaveDate ? new Date(selectedPolicy.nextLeaveDate).toLocaleDateString() : "—"} />
            </div>
          ) : (
            <div style={emptyStyle}>Select a leave policy to view entitlement, usage, balance and requestable leave information.</div>
          )}

          {profile.exceptionWarnings?.length ? <div style={warningStyle}>{profile.exceptionWarnings.join(" · ")}</div> : null}
        </>
      )}
    </section>
  );
}

function Metric({ label, value }) {
  return <div style={metricStyle}><span>{label}</span><strong>{value}</strong></div>;
}

const panelStyle = { marginTop: 18, padding: 18, border: "1px solid rgba(212,175,55,.38)", borderRadius: 14, background: "linear-gradient(145deg,rgba(8,50,33,.9),rgba(3,20,13,.96))" };
const eyebrowStyle = { color: "#D4AF37", fontSize: 10, fontWeight: 900, letterSpacing: ".14em" };
const titleStyle = { margin: "5px 0 4px", color: "#F7FAF8", fontSize: 18 };
const helpStyle = { margin: "0 0 14px", color: "#A9BDB2", fontSize: 12, lineHeight: 1.55 };
const selectorGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 12, alignItems: "end" };
const fieldStyle = { display: "grid", gap: 6, color: "#C7D3CC", fontSize: 12, fontWeight: 800 };
const inputStyle = { width: "100%", boxSizing: "border-box", borderRadius: 9, border: "1px solid rgba(212,175,55,.35)", padding: "10px 11px", background: "rgba(255,255,255,.06)", color: "#F7FAF8" };
const identityStyle = { display: "grid", gap: 4, marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,.035)", color: "#C7D3CC" };
const metricGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 10, marginTop: 12 };
const metricStyle = { display: "grid", gap: 5, padding: 12, borderRadius: 10, border: "1px solid rgba(212,175,55,.22)", background: "rgba(255,255,255,.035)", color: "#A9BDB2", fontSize: 11 };
const loadingStyle = { marginTop: 12, color: "#A9BDB2" };
const emptyStyle = { marginTop: 12, color: "#A9BDB2", fontSize: 12 };
const errorStyle = { marginTop: 12, padding: 10, borderRadius: 9, color: "#FCA5A5", border: "1px solid rgba(248,113,113,.45)" };
const warningStyle = { marginTop: 12, padding: 10, borderRadius: 9, color: "#F8D56B", border: "1px solid rgba(248,213,107,.4)", fontSize: 12 };
