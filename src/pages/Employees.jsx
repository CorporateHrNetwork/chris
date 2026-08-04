import EmployeeTable from "../components/employees/EmployeeTable";

function Employees() {
  return (
    <>
      <h1
        style={{
          color: "#065F46",
          marginTop: 0,
        }}
      >
        Employee Management
      </h1>

      <EmployeeTable />
    </>
  );
}

export default Employees;