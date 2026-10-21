const test=require('node:test'),assert=require('node:assert/strict'),XLSX=require('xlsx');
const {readWorkbook}=require('../src/services/zermattSalaryWorkbook');
const {prepareSalaryRows}=require('../src/services/zermattSalarySplit');
function workbook(value,format,date1904=false){const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([['Employee No','Employee Name (reference)','Branch (reference)','Full Monthly Gross Salary','Currency','Effective From','Reason'],['Z1','Wrong submitted name','Wrong branch',120000,'NGN',value,'Opening upload']]);if(format)sheet.F2.z=format;XLSX.utils.book_append_sheet(book,sheet,'Full Salaries');if(date1904)book.Workbook={WBProps:{date1904:true}};return XLSX.write(book,{type:'buffer',bookType:'xlsx'});}
const staff=[{id:'e1',employeeNumber:'Z1',firstName:'Authoritative',lastName:'Employee',employmentType:'Full-Time',hireDate:'2020-01-01',location:{name:'LAGOS BRANCH'}}];
test('native Excel dates and ISO text preserve the payroll month and numeric salary',()=>{
 for(const [value,format,expected,date1904] of [['2026-11-01',null,'2026-11-01',false],[46327,'m/d/yy','2026-11-01',false],[46327,'dd/mm/yyyy','2026-11-01',false],[44865,'m/d/yy','2026-11-01',true]]){
  const rows=readWorkbook(workbook(value,format,date1904));assert.equal(rows[0]['Effective From'],expected);assert.equal(rows[0]['Full Monthly Gross Salary'],120000);
  const [row]=prepareSalaryRows(rows,staff);assert.equal(row.valid,true);assert.equal(row.employeeName,'Authoritative Employee');assert.equal(row.branch,'LAGOS BRANCH');assert.equal(row.allocation.endMonthGross,90000);
 }
});
test('blank, ambiguous, fictional and non-first-day dates remain invalid',()=>{
 for(const value of ['', '01/11/2026','2026-02-30','2026-11-02',60,46327.5])assert.equal(prepareSalaryRows(readWorkbook(workbook(value)),staff)[0].valid,false);
});
test('invalid-date preview still identifies the authoritative employee',()=>{const [row]=prepareSalaryRows(readWorkbook(workbook('')),staff);assert.equal(row.valid,false);assert.equal(row.employeeName,'Authoritative Employee');assert.equal(row.branch,'LAGOS BRANCH');});
