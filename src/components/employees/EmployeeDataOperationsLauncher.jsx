export default function EmployeeDataOperationsLauncher({
  onClose,
  onSingle,
  onBulk,
  onInvite,
}) {
  return (
    <div style={backdropStyle} role="presentation" onMouseDown={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="employee-data-operations-title"
        style={modalStyle}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>EMPLOYEE DATA OPERATIONS</div>
            <h2 id="employee-data-operations-title" style={titleStyle}>Employee Entry & Assignment</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close employee data options" style={closeStyle}>×</button>
        </header>

        <div style={optionListStyle}>
          <Option
            icon="+"
            title="Add single employee"
            description="Create one employee through the existing controlled CHRiS creation flow."
            onClick={onSingle}
          />
          <Option
            icon="⇧"
            title="Bulk upload / assign employees"
            description="Create employees from Excel or assign Employment Type and Cost Centre to existing employees individually or in bulk."
            onClick={onBulk}
          />
          <Option
            icon="↗"
            title="Invite with a secure link"
            description="Send a time-limited self-onboarding link and review submitted details before employee creation."
            onClick={onInvite}
          />
        </div>
      </section>
    </div>
  );
}

function Option({ icon, title, description, onClick }) {
  return (
    <button type="button" onClick={onClick} style={optionStyle}>
      <span aria-hidden="true" style={iconStyle}>{icon}</span>
      <span style={{ minWidth: 0 }}>
        <strong style={optionTitleStyle}>{title}</strong>
        <span style={optionDescriptionStyle}>{description}</span>
      </span>
      <span aria-hidden="true" style={arrowStyle}>›</span>
    </button>
  );
}

const backdropStyle = { position: "fixed", inset: 0, zIndex: 1500, display: "grid", placeItems: "center", padding: 20, background: "rgba(0,0,0,.56)", backdropFilter: "blur(3px)" };
const modalStyle = { width: "min(640px,100%)", borderRadius: 18, border: "1px solid rgba(212,175,55,.62)", background: "linear-gradient(145deg,#073923,#031b12)", color: "#F7FAF8", boxShadow: "0 28px 80px rgba(0,0,0,.48)", overflow: "hidden" };
const headerStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "20px 22px", borderBottom: "1px solid rgba(255,255,255,.09)" };
const eyebrowStyle = { color: "#D4AF37", fontSize: 10, fontWeight: 900, letterSpacing: ".15em" };
const titleStyle = { margin: "4px 0 0", fontSize: 24 };
const closeStyle = { border: 0, background: "transparent", color: "#F7FAF8", fontSize: 28, cursor: "pointer", padding: "4px 10px" };
const optionListStyle = { display: "grid", gap: 8, padding: 14 };
const optionStyle = { width: "100%", display: "grid", gridTemplateColumns: "48px minmax(0,1fr) 28px", alignItems: "center", gap: 14, padding: "15px 14px", border: "1px solid transparent", borderRadius: 13, background: "rgba(255,255,255,.035)", color: "#F7FAF8", textAlign: "left", cursor: "pointer" };
const iconStyle = { display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: "50%", background: "rgba(212,175,55,.16)", border: "1px solid rgba(212,175,55,.62)", color: "#D4AF37", fontWeight: 900, fontSize: 23 };
const optionTitleStyle = { display: "block", fontSize: 15 };
const optionDescriptionStyle = { display: "block", marginTop: 4, color: "#C7D3CC", lineHeight: 1.45, fontSize: 12.5 };
const arrowStyle = { color: "#D4AF37", fontSize: 30 };
