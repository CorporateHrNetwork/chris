const ExcelJS = require("exceljs");

const TEMPLATE_HEADERS = [
  "Employee No",
  "Employee Name",
  "Department",
  "Designation",
  "Employment Type",
  "Cost Centre / Operating Unit",
  "Line Manager Selection",
  "Effective From",
  "Reason",
];

function employeeName(employee) {
  return [employee?.firstName, employee?.middleName, employee?.lastName]
    .filter(Boolean)
    .join(" ");
}

function displayCostCentre(costCentre) {
  if (!costCentre) return "";
  return [costCentre.code, costCentre.name].filter(Boolean).join(" - ");
}

function displayManager(manager) {
  if (!manager) return "";
  return [
    manager.employeeNumber,
    employeeName(manager),
    manager.designation?.name || "No designation",
    manager.department?.name || "No department",
  ].filter(Boolean).join(" — ");
}

function columnLetter(number) {
  let result = "";
  let value = number;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function safeSheetText(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}

async function buildAssignmentTemplateWorkbook({
  employmentTypes = [],
  costCentres = [],
  employees = [],
  managerOptionsByEmployee = {},
} = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CHRiS";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("Employee Assignments", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { header: TEMPLATE_HEADERS[0], key: "employeeNumber", width: 16 },
    { header: TEMPLATE_HEADERS[1], key: "employeeName", width: 32 },
    { header: TEMPLATE_HEADERS[2], key: "department", width: 28 },
    { header: TEMPLATE_HEADERS[3], key: "designation", width: 34 },
    { header: TEMPLATE_HEADERS[4], key: "employmentType", width: 22 },
    { header: TEMPLATE_HEADERS[5], key: "costCentre", width: 34 },
    { header: TEMPLATE_HEADERS[6], key: "lineManager", width: 72 },
    { header: TEMPLATE_HEADERS[7], key: "effectiveFrom", width: 18 },
    { header: TEMPLATE_HEADERS[8], key: "reason", width: 36 },
  ];

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 30;

  const validationSheet = workbook.addWorksheet("Validation Lists");
  validationSheet.state = "veryHidden";
  validationSheet.getCell("A1").value = "Employment Types";
  validationSheet.getCell("B1").value = "Cost Centres";
  validationSheet.getCell("C1").value = "Manager List Key";

  employmentTypes.forEach((value, index) => {
    validationSheet.getCell(index + 2, 1).value = safeSheetText(value);
  });
  costCentres.forEach((value, index) => {
    validationSheet.getCell(index + 2, 2).value = safeSheetText(displayCostCentre(value));
  });

  const employeeManagerColumnByNumber = new Map();
  let managerColumn = 4;

  employees.forEach((employee, index) => {
    const rowNumber = index + 2;
    const currentManager = employee.currentLineManager || null;
    const managerOptions = managerOptionsByEmployee[employee.employeeNumber] || [];
    const managerList = managerOptions.map((manager) => displayManager(manager));

    sheet.addRow({
      employeeNumber: employee.employeeNumber,
      employeeName: employeeName(employee),
      department: employee.department?.name || "",
      designation: employee.designation?.name || "",
      employmentType: employee.employmentType || "",
      costCentre: displayCostCentre(employee.costCentre),
      lineManager: currentManager ? displayManager(currentManager) : "",
      effectiveFrom: currentManager?.effectiveFrom
        ? new Date(currentManager.effectiveFrom)
        : null,
      reason: "",
    });

    const row = sheet.getRow(rowNumber);
    row.getCell(8).numFmt = "yyyy-mm-dd";

    // Identity and organizational context are prefilled from CHRiS and protected from accidental edits.
    [1, 2, 3, 4].forEach((column) => {
      row.getCell(column).protection = { locked: true };
    });

    // HR may correct the prefilled Employment Type, Cost Centre and Line Manager where necessary.
    [5, 6, 7, 8, 9].forEach((column) => {
      row.getCell(column).protection = { locked: false };
    });
    row.getCell(5).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: employmentTypes.length
        ? [`'Validation Lists'!$A$2:$A$${employmentTypes.length + 1}`]
        : [],
    };
    row.getCell(6).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: costCentres.length
        ? [`'Validation Lists'!$B$2:$B$${costCentres.length + 1}`]
        : [],
    };

    if (managerList.length) {
      const columnLetterValue = columnLetter(managerColumn);
      validationSheet.getCell(1, managerColumn).value = employee.employeeNumber;
      managerList.forEach((value, managerIndex) => {
        validationSheet.getCell(managerIndex + 2, managerColumn).value = safeSheetText(value);
      });
      row.getCell(7).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [`'Validation Lists'!${columnLetterValue}$2:${columnLetterValue}${managerList.length + 1}`],
      };
      employeeManagerColumnByNumber.set(employee.employeeNumber, columnLetterValue);
      managerColumn += 1;
    }

  });

  // Allow corrections only in fields intended for the assignment workflow.
  sheet.protect("CHRiS-assignment-template", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatColumns: true,
    formatRows: true,
    sort: true,
    autoFilter: true,
  });

  sheet.autoFilter = {
    from: "A1",
    to: `I${Math.max(1, employees.length + 1)}`,
  };

  validationSheet.columnCount = Math.max(3, managerColumn - 1);
  for (let column = 1; column <= validationSheet.columnCount; column += 1) {
    validationSheet.getColumn(column).width = 45;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

module.exports = {
  TEMPLATE_HEADERS,
  buildAssignmentTemplateWorkbook,
};
