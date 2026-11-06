const test=require('node:test'),assert=require('node:assert/strict'),XLSX=require('xlsx');
const {appendRegisterSheets,selectedIndexes}=require('../src/services/payrollRegisterExport');
test('selected columns stay selected across master and individual branches with account text preserved',()=>{
 const workbook=XLSX.utils.book_new();
 appendRegisterSheets(workbook,{headers:['Location','EmployeeNO','FullName','Net','AccountNO'],rows:[['PHC','Z3','Third',900,'0012345678'],['LAGOS BRANCH','Z2','Second',800,'0098765432'],['HEAD OFFICE','Z1','First',700,'0000001234']],columns:'[4,1,0]',branchIndex:0,employeeIndex:1});
 const loaded=XLSX.read(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}),{type:'buffer'});
 assert.deepEqual(loaded.SheetNames,['Master Roll','Abuja','Lagos','Port Harcourt']);
 const master=XLSX.utils.sheet_to_json(loaded.Sheets['Master Roll'],{header:1});
 assert.deepEqual(master,[['Location','EmployeeNO','AccountNO'],['Abuja','Z1','0000001234'],['Lagos','Z2','0098765432'],['Port Harcourt','Z3','0012345678']]);
 for(const name of ['Abuja','Lagos','Port Harcourt']){const rows=XLSX.utils.sheet_to_json(loaded.Sheets[name],{header:1});assert.equal(rows.length,2);assert.equal(rows[1][0],name);}
 assert.equal(loaded.Sheets.Abuja.C2.t,'s');
});
test('invalid or empty column requests fail closed and unknown branches remain visible',()=>{
 for(const value of ['[]','[0,0]','[-1]','[2]','["0"]','no'])assert.throws(()=>selectedIndexes(['a','b'],value));
 const w=XLSX.utils.book_new();appendRegisterSheets(w,{headers:['Branch','Employee No'],rows:[['New Branch','Z4']],branchIndex:0,employeeIndex:1});
 assert.ok(w.SheetNames.includes('New Branch'));assert.equal(w.Sheets['Master Roll'].A2.v,'New Branch');
});
