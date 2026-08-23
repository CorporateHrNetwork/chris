import { useEffect, useMemo, useRef, useState } from "react";

function valueText(value) {
  return String(value ?? "").trim();
}

function departmentName(employee) {
  return (
    employee?.department?.name ||
    employee?.departmentName ||
    employee?.department ||
    ""
  );
}

function designationName(employee) {
  return (
    employee?.designation?.name ||
    employee?.designationName ||
    employee?.designation ||
    ""
  );
}

function fullName(employee) {
  return [
    employee?.firstName,
    employee?.middleName,
    employee?.lastName || employee?.surname,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function employeeLabel(employee) {
  const number = valueText(employee?.employeeNumber);
  const name = fullName(employee);

  return [number, name]
    .filter(Boolean)
    .join(" — ");
}

function searchableText(employee) {
  return [
    employee?.id,
    employee?.employeeNumber,
    employee?.firstName,
    employee?.middleName,
    employee?.lastName,
    employee?.surname,
    fullName(employee),
    departmentName(employee),
    designationName(employee),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export default function EmployeeSearchSelect({
  employees = [],
  loading = false,
  value = "",
  onChange,
}) {
  const rootRef = useRef(null);

  const selectedEmployee = useMemo(
    () =>
      employees.find(
        (employee) =>
          String(employee?.employeeNumber) ===
          String(value)
      ) || null,
    [employees, value]
  );

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (selectedEmployee) {
      setQuery(employeeLabel(selectedEmployee));
    } else if (!value) {
      setQuery("");
    }
  }, [selectedEmployee, value]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target)
      ) {
        setOpen(false);

        if (selectedEmployee) {
          setQuery(employeeLabel(selectedEmployee));
        }
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, [selectedEmployee]);

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();

    if (!trimmed) {
      return employees.slice(0, 12);
    }

    if (
      selectedEmployee &&
      trimmed ===
        employeeLabel(selectedEmployee).toLowerCase()
    ) {
      return [];
    }

    return employees
      .filter((employee) =>
        searchableText(employee).includes(trimmed)
      )
      .slice(0, 20);
  }, [employees, query, selectedEmployee]);

  function handleInputChange(event) {
    const nextQuery = event.target.value;

    setQuery(nextQuery);
    setOpen(true);

    if (selectedEmployee) {
      const selectedLabel =
        employeeLabel(selectedEmployee);

      if (nextQuery !== selectedLabel) {
        onChange?.("");
      }
    }
  }

  function selectEmployee(employee) {
    const employeeNumber =
      employee?.employeeNumber || "";

    onChange?.(employeeNumber);

    setQuery(employeeLabel(employee));
    setOpen(false);
  }

  return (
    <div
      ref={rootRef}
      className="leave-field leave-field--wide"
      style={{
        position: "relative",
        zIndex: open ? 40 : "auto",
      }}
    >
      <label
        htmlFor="leave-employee-search"
        style={{
          display: "block",
          marginBottom: 6,
          fontWeight: 700,
        }}
      >
        Employee *
      </label>

      <input
        id="leave-employee-search"
        type="text"
        autoComplete="off"
        value={query}
        disabled={loading}
        placeholder={
          loading
            ? "Loading employees..."
            : "Search employee name or ID"
        }
        onFocus={() => {
          if (!selectedEmployee) {
            setOpen(true);
          }
        }}
        onChange={handleInputChange}
        style={{
          width: "100%",
          boxSizing: "border-box",
          minHeight: 44,
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid rgba(206, 168, 27, 0.25)",
          background: "#10261d",
          color: "#f4f7f5",
          outline: "none",
        }}
      />

      {open && !selectedEmployee && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 6,
            maxHeight: 280,
            overflowY: "auto",
            borderRadius: 10,
            border:
              "1px solid rgba(206, 168, 27, 0.35)",
            background: "#071a13",
            boxShadow:
              "0 16px 35px rgba(0, 0, 0, 0.38)",
            zIndex: 1000,
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 14,
                color: "#a8b9b0",
              }}
            >
              Loading employees...
            </div>
          ) : results.length ? (
            results.map((employee) => {
              const number =
                employee?.employeeNumber || "";

              return (
                <button
                  key={
                    employee?.id ||
                    employee?.employeeNumber
                  }
                  type="button"
                  role="option"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectEmployee(employee);
                  }}
                  style={{
                    width: "100%",
                    display: "block",
                    textAlign: "left",
                    padding: "11px 13px",
                    border: 0,
                    borderBottom:
                      "1px solid rgba(255,255,255,0.06)",
                    background: "transparent",
                    color: "#f4f7f5",
                    cursor: "pointer",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 700,
                    }}
                  >
                    {number} — {fullName(employee)}
                  </div>

                  {(departmentName(employee) ||
                    designationName(employee)) && (
                    <div
                      style={{
                        marginTop: 4,
                        fontSize: 12,
                        color: "#a8b9b0",
                      }}
                    >
                      {[
                        departmentName(employee),
                        designationName(employee),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <div
              style={{
                padding: 14,
                color: "#a8b9b0",
              }}
            >
              No matching employees found.
            </div>
          )}
        </div>
      )}
    </div>
  );
}