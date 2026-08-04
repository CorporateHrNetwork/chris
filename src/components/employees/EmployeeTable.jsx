import employees from "../../data/employees";

function EmployeeTable() {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: "18px",
        padding: "25px",
        boxShadow: "0 8px 25px rgba(0,0,0,.05)",
      }}
    >
      <h2 style={{ marginTop: 0, color: "#065F46" }}>
        Employees
      </h2>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          marginTop: "20px",
        }}
      >
        <thead>
          <tr
            style={{
              background: "#F3F4F6",
            }}
          >
            <th style={th}>Employee ID</th>
            <th style={th}>Name</th>
            <th style={th}>Department</th>
            <th style={th}>Designation</th>
            <th style={th}>Status</th>
          </tr>
        </thead>

        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id}>
              <td style={td}>{employee.id}</td>
              <td style={td}>{employee.name}</td>
              <td style={td}>{employee.department}</td>
              <td style={td}>{employee.designation}</td>
              <td style={td}>{employee.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "14px",
  color: "#374151",
};

const td = {
  padding: "14px",
  borderBottom: "1px solid #E5E7EB",
};

export default EmployeeTable;