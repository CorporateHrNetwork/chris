import assert from "node:assert/strict";
import { normalizeEmployees, searchEmployees } from "../../src/components/leave/employeeSelector.js";
const employees=normalizeEmployees({data:[{id:"employee-9",employeeNumber:"CHR000009",firstName:"Tanni",lastName:"Johnson",department:{name:"Supply Chain"},designation:{name:"Supply Chain Officer"}}]});
for(const query of ["CHR000009","Tanni","Johnson","Tanni Johnson"])assert.equal(searchEmployees(employees,query)[0]?.employeeNumber,"CHR000009");
assert.equal(employees[0].department.name,"Supply Chain");
assert.equal(employees[0].designation.name,"Supply Chain Officer");
console.log("PASS: employee selector response-shape tests passed.");
