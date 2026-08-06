import { useEffect, useState } from "react";
import {
  useNavigate,
  useParams,
} from "react-router-dom";

function EmployeeProfile() {
  const { employeeNumber } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `http://localhost:5000/api/employees/${encodeURIComponent(
            employeeNumber
          )}`
        );

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.message ||
              "Unable to load employee profile."
          );
        }

        const employee = result.data;

        setProfile({
          databaseId: employee.id,

          id: employee.employeeNumber,

          name: [
            employee.firstName,
            employee.middleName,
            employee.lastName,
          ]
            .filter(Boolean)
            .join(" "),

          department:
            employee.department?.name || "-",

          designation:
            employee.designation?.name || "-",

          email: employee.email || "",
          phone: employee.phone || "",

          status: formatStatus(
            employee.status
          ),

          firstName: employee.firstName,
          middleName: employee.middleName,
          lastName: employee.lastName,

          hireDate: employee.hireDate,

          confirmationDate:
            employee.confirmationDate,

          exitDate: employee.exitDate,
        });
      } catch (err) {
        console.error(
          "Employee profile error:",
          err
        );

        setError(
          err.message ||
            "CHRIS could not load the employee profile."
        );
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [employeeNumber]);

  if (loading) {
    return (
      <div
        style={{
          padding: "40px",
          textAlign: "center",
          color: "#64748B",
          fontSize: "14px",
        }}
      >
        Loading employee profile...
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div
        style={{
          width: "100%",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <button
          type="button"
          onClick={() =>
            navigate("/employees")
          }
          style={backButtonStyle}
        >
          &lt; Back to Employees
        </button>

        <div
          style={{
            padding: "18px",
            background: "#FEF2F2",
            border: "1px solid #FECACA",
            borderRadius: "12px",
            color: "#B91C1C",
            fontWeight: "600",
          }}
        >
          {error ||
            "Unable to load employee profile."}
        </div>
      </div>
    );
  }

  const initials = profile.name
    .split(" ")
    .map((name) => name.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <button
        type="button"
        onClick={() =>
          navigate("/employees")
        }
        style={backButtonStyle}
      >
        &lt; Back to Employees
      </button>

      {/* PROFILE HEADER */}
      <div
        style={{
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          borderRadius: "18px",
          padding: "26px",
          marginBottom: "22px",
          boxShadow:
            "0 6px 24px rgba(15, 23, 42, 0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
          }}
        >
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "50%",
              background: "#E8F5EF",
              color: "#0B5E3B",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              fontWeight: "800",
              flexShrink: 0,
            }}
          >
            {initials}
          </div>

          <div>
            <p
              style={{
                margin: "0 0 5px",
                color: "#64748B",
                fontSize: "13px",
                fontWeight: "600",
              }}
            >
              Employee Profile
            </p>

            <h1
              style={{
                margin: 0,
                color: "#0F172A",
                fontSize: "28px",
                fontWeight: "800",
              }}
            >
              {profile.name}
            </h1>

            <p
              style={{
                margin: "6px 0 0",
                color: "#64748B",
                fontSize: "14px",
              }}
            >
              {profile.designation} -{" "}
              {profile.department}
            </p>
          </div>
        </div>

        <StatusBadge
          status={profile.status}
        />
      </div>

      {/* PROFILE CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "22px",
        }}
      >
        <InformationCard title="Employee Information">
          <InfoRow
            label="Full Name"
            value={profile.name}
          />

          <InfoRow
            label="Employee ID"
            value={profile.id}
          />

          <InfoRow
            label="Department"
            value={profile.department}
          />

          <InfoRow
            label="Designation"
            value={profile.designation}
          />

          <InfoRow
            label="Employment Status"
            value={profile.status}
          />
        </InformationCard>

        <InformationCard title="Contact Information">
          <InfoRow
            label="Email"
            value={profile.email}
          />

          <InfoRow
            label="Phone"
            value={profile.phone}
          />
        </InformationCard>

        <InformationCard title="Employment">
          <InfoRow
            label="Department"
            value={profile.department}
          />

          <InfoRow
            label="Designation"
            value={profile.designation}
          />

          <InfoRow
            label="Status"
            value={profile.status}
          />

          <InfoRow
            label="Hire Date"
            value={formatDate(
              profile.hireDate
            )}
          />

          <InfoRow
            label="Confirmation Date"
            value={formatDate(
              profile.confirmationDate
            )}
          />

          <InfoRow
            label="Exit Date"
            value={formatDate(
              profile.exitDate
            )}
          />
        </InformationCard>

        <InformationCard title="Quick Actions">
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(2, 1fr)",
              gap: "12px",
            }}
          >
            <ActionButton text="Edit Employee" />
            <ActionButton text="Leave" />
            <ActionButton text="Payroll" />
            <ActionButton text="Documents" />
          </div>
        </InformationCard>
      </div>
    </div>
  );
}

function formatStatus(status) {
  const labels = {
    ACTIVE: "Active",
    PROBATION: "Probation",
    LEAVE: "Leave",
    SUSPENDED: "Suspended",
    TERMINATED: "Terminated",
    RESIGNED: "Resigned",
    RETIRED: "Retired",
    INACTIVE: "Inactive",
  };

  return labels[status] || status;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  return new Date(
    value
  ).toLocaleDateString();
}

function StatusBadge({ status }) {
  let background = "#F1F5F9";
  let color = "#475569";

  if (status === "Active") {
    background = "#E8F8F0";
    color = "#087443";
  }

  if (status === "Leave") {
    background = "#FFF4E5";
    color = "#B45309";
  }

  if (status === "Probation") {
    background = "#F0E9FF";
    color = "#6D28D9";
  }

  if (status === "Suspended") {
    background = "#FEF2F2";
    color = "#B91C1C";
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "8px 14px",
        borderRadius: "999px",
        background,
        color,
        fontSize: "13px",
        fontWeight: "700",
      }}
    >
      {status}
    </div>
  );
}

function InformationCard({
  title,
  children,
}) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E5E7EB",
        borderRadius: "18px",
        padding: "24px",
        boxShadow:
          "0 6px 24px rgba(15, 23, 42, 0.05)",
      }}
    >
      <h2
        style={{
          margin: "0 0 18px",
          color: "#0B5E3B",
          fontSize: "18px",
          fontWeight: "800",
        }}
      >
        {title}
      </h2>

      {children}
    </div>
  );
}

function InfoRow({
  label,
  value,
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "20px",
        padding: "13px 0",
        borderBottom:
          "1px solid #EEF2F1",
      }}
    >
      <span
        style={{
          color: "#64748B",
          fontSize: "13px",
        }}
      >
        {label}
      </span>

      <span
        style={{
          color: "#0F172A",
          fontSize: "14px",
          fontWeight: "700",
          textAlign: "right",
        }}
      >
        {value || "-"}
      </span>
    </div>
  );
}

function ActionButton({ text }) {
  return (
    <button
      type="button"
      style={{
        border: "1px solid #D1E5DB",
        background: "#F8FCFA",
        color: "#0B5E3B",
        borderRadius: "10px",
        padding: "12px",
        fontSize: "13px",
        fontWeight: "700",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background =
          "#E8F5EF";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background =
          "#F8FCFA";
      }}
    >
      {text}
    </button>
  );
}

const backButtonStyle = {
  border: "none",
  background: "transparent",
  color: "#0B5E3B",
  fontSize: "14px",
  fontWeight: "700",
  cursor: "pointer",
  padding: 0,
  marginBottom: "22px",
};

export default EmployeeProfile;