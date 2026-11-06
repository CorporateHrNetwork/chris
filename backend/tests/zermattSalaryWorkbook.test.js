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

test('accounting-formatted headings use raw text and preserve numeric salary',()=>{
 const book=XLSX.read(workbook(46327,'yyyy-mm-dd'),{type:'buffer'});
 const sheet=book.Sheets['Full Salaries'];
 sheet.D1.z='_-* #,##0.00_-;\\\\-* #,##0.00_-;_-* "-"??_-;_-@_-';
 sheet.D2.z=sheet.D1.z;
 const buffer=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
 const parsed=XLSX.read(buffer,{type:'buffer'});
 assert.notEqual(parsed.Sheets['Full Salaries'].D1.w,'Full Monthly Gross Salary','Reproduce accounting padding in displayed heading');
 const rows=readWorkbook(buffer);
 assert.equal(rows[0]['Full Monthly Gross Salary'],120000);
 assert.equal(prepareSalaryRows(rows,staff)[0].valid,true);
});
test('normalized header spacing is accepted while missing or duplicate salary columns fail clearly',()=>{
 const book=XLSX.read(workbook('2026-11-01'),{type:'buffer'});
 book.Sheets['Full Salaries'].D1.v='  Full Monthly Gross Salary  ';
 assert.equal(readWorkbook(XLSX.write(book,{type:'buffer',bookType:'xlsx'}))[0]['Full Monthly Gross Salary'],120000);
 book.Sheets['Full Salaries'].D1.v='Wrong heading';
 assert.throws(()=>readWorkbook(XLSX.write(book,{type:'buffer',bookType:'xlsx'})),/Missing required column: Full Monthly Gross Salary/);
 book.Sheets['Full Salaries'].D1.v='Employee No';
 assert.throws(()=>readWorkbook(XLSX.write(book,{type:'buffer',bookType:'xlsx'})),/Duplicate column heading/);
});
