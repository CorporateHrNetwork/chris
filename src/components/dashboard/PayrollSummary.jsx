function formatNaira(value) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function PayrollSummary({ summary }) {
  const latestRun = summary?.latestRun || null;
  const loading = Boolean(summary?.loading);
  const error = Boolean(summary?.error);

  return (
    <div style={cardStyle}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "3px",
          background:
            "linear-gradient(90deg, rgba(8,122,67,0.90), rgba(212,175,55,0.90), rgba(8,122,67,0.18))",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          width: "150px",
          height: "150px",
          right: "-55px",
          bottom: "-70px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(8,122,67,0.08), transparent 68%)",
        }}
      />

      <h3 style={titleStyle}>
        Payroll Summary
      </h3>

      {loading && (
        <p style={bodyStyle}>
          Loading the latest payroll run...
        </p>
      )}

      {!loading && error && (
        <p style={errorStyle}>
          Payroll data is temporarily unavailable.
        </p>
      )}

      {!loading && !error && !latestRun && (
        <p style={bodyStyle}>
          No payroll run is available yet.
        </p>
      )}

      {!loading && !error && latestRun && (
        <>
          <div style={runHeaderStyle}>
            <div>
              <div style={periodStyle}>
                {latestRun.periodName || latestRun.periodCode || "Latest Payroll"}
              </div>
              <div style={metaStyle}>
                {latestRun.periodCode || "Payroll period"}
                {latestRun.payDate ? ` · Pay date ${latestRun.payDate}` : ""}
              </div>
            </div>

            <span style={statusStyle}>
              {latestRun.status || "UNKNOWN"}
            </span>
          </div>

          <div style={gridStyle}>
            <SummaryItem
              label="Employees"
              value={Number(latestRun.employeeCount || 0).toLocaleString("en-NG")}
            />
            <SummaryItem
              label="Gross Payroll"
              value={formatNaira(latestRun.grossTotal)}
            />
            <SummaryItem
              label="Deductions"
              value={formatNaira(latestRun.deductionTotal)}
            />
            <SummaryItem
              label="Net Payroll"
              value={formatNaira(latestRun.netPreviewTotal)}
            />
          </div>

          <p style={controlStyle}>
            Dashboard values come directly from the latest calculated payroll run. Branch users see only their assigned branch share; Head Office sees the consolidated company total.
          </p>
        </>
      )}
    </div>
  );
}

function SummaryItem({ label, value }) {
  return (
    <div style={itemStyle}>
      <div style={itemLabelStyle}>{label}</div>
      <div style={itemValueStyle}>{value}</div>
    </div>
  );
}

const cardStyle = {
  background:
    "linear-gradient(145deg, rgba(255,255,255,0.985), rgba(246,250,247,0.97))",
  border:
    "1px solid rgba(212,175,55,0.20)",
  borderRadius:
    "18px",
  padding:
    "24px",
  boxShadow:
    "0 14px 34px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.90)",
  minHeight:
    "280px",
  position:
    "relative",
  overflow:
    "hidden",
};

const titleStyle = {
  margin: 0,
  color: "#075F36",
  fontSize: "17px",
  fontWeight: "900",
  letterSpacing: "0.01em",
  position: "relative",
};

const bodyStyle = {
  margin: "10px 0 0",
  color: "#6B7D73",
  fontSize: "13px",
  lineHeight: "1.65",
  fontWeight: "600",
  position: "relative",
};

const errorStyle = {
  ...bodyStyle,
  color: "#B91C1C",
};

const runHeaderStyle = {
  marginTop: "18px",
  display: "flex",
  justifyContent: "space-between",
  gap: "16px",
  alignItems: "flex-start",
  position: "relative",
};

const periodStyle = {
  color: "#0F172A",
  fontSize: "16px",
  fontWeight: "900",
};

const metaStyle = {
  marginTop: "4px",
  color: "#64748B",
  fontSize: "11px",
  fontWeight: "600",
};

const statusStyle = {
  padding: "6px 10px",
  borderRadius: "999px",
  background: "#ECFDF5",
  color: "#047857",
  fontSize: "10px",
  fontWeight: "900",
};

const gridStyle = {
  marginTop: "18px",
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "12px",
  position: "relative",
};

const itemStyle = {
  padding: "12px",
  borderRadius: "12px",
  background: "#F8FAFC",
  border: "1px solid #E2E8F0",
};

const itemLabelStyle = {
  color: "#64748B",
  fontSize: "10px",
  fontWeight: "800",
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const itemValueStyle = {
  marginTop: "6px",
  color: "#075F36",
  fontSize: "16px",
  fontWeight: "900",
  overflowWrap: "anywhere",
};

const controlStyle = {
  margin: "16px 0 0",
  color: "#64748B",
  fontSize: "11px",
  lineHeight: 1.55,
  fontWeight: "600",
  position: "relative",
};

export default PayrollSummary;
