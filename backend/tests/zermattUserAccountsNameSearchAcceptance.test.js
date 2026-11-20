const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ui=fs.readFileSync(path.resolve(__dirname,"../../src/components/settings/UsersRolesSettings.jsx"),"utf8");
const usersTab=ui.slice(ui.indexOf("function UsersTab({"),ui.indexOf("function RolesTab(")>0?ui.indexOf("function RolesTab("):undefined);
test("Users & Roles type-search uses employee name, linked number and email from account's authorized list",()=>{
 assert.ok(usersTab.includes('Type-search employee account'));
 assert.ok(usersTab.includes('employee.middleName'));
 assert.ok(usersTab.includes('employee.employeeNumber'));
 assert.ok(usersTab.includes('employee.email'));
 assert.ok(usersTab.includes('normalizedQuery.split(/\\s+/)'));
 assert.ok(usersTab.includes('candidateAccounts.slice(0, 12)'));
});
test("type-search selection filters accounts without changing account actions",()=>{
 assert.ok(usersTab.includes('setSelectedAccountId(user.id)'));
 assert.ok(usersTab.includes('visibleAccounts.map('));
 assert.ok(usersTab.includes('clearAccountSearch'));
 assert.ok(usersTab.includes('Matching employee accounts'));
 assert.ok(usersTab.includes('onSendRecovery(user,"admin")'));
 assert.ok(usersTab.includes('onSendRecovery(user,"ess")'));
 assert.ok(usersTab.includes('onSuspension(user)'));
 assert.ok(usersTab.includes('onStatusChange('));
});
