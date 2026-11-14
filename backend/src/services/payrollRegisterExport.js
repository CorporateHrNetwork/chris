const XLSX = require('xlsx');
function invalid(message) { throw Object.assign(new Error(message), {statusCode:400,code:'INVALID_EXPORT_COLUMNS'}); }
function selectedIndexes(headers, value) {
 if(value == null) return headers.map((_,i)=>i);
 let indexes;try {indexes=typeof value==='string'?JSON.parse(value):value;}catch {invalid('Select valid export columns.');}
 if(!Array.isArray(indexes)||!indexes.length||indexes.some(i=>!Number.isInteger(i)||i<0||i>=headers.length)||new Set(indexes).size!==indexes.length)invalid('Select at least one valid column without duplicates. Refresh if the register changed.');
 return [...indexes].sort((a,b)=>a-b);
}
function branchName(value) {
 const s=String(value||'').trim(),u=s.toUpperCase();
 if(/ABUJA|HEAD OFFICE/.test(u)||['ABJ','HO'].includes(u))return 'Abuja';
 if(/LAGOS/.test(u)||u==='LAG')return 'Lagos';
 if(/PORT\s*HARCOURT/.test(u)||/\bPHC\b/.test(u))return 'Port Harcourt';
 return s||'Unassigned';
}
function rank(value) {const n=['Abuja','Lagos','Port Harcourt'].indexOf(branchName(value));return n<0?3:n;}
function compareBranches(a,b) {return rank(a)-rank(b)||branchName(a).localeCompare(branchName(b));}
function appendRegisterSheets(workbook,{headers,rows,columns,branchIndex,employeeIndex,masterName='Master Roll',serialIndex=null}) {
 const indexes=selectedIndexes(headers,columns);
 const sorted=rows.map(row=>{const copy=[...row];copy[branchIndex]=branchName(copy[branchIndex]);return copy;}).sort((a,b)=>compareBranches(a[branchIndex],b[branchIndex])||String(a[employeeIndex]||'').localeCompare(String(b[employeeIndex]||''),undefined,{numeric:true}));
 if(serialIndex!=null)sorted.forEach((row,i)=>{row[serialIndex]=i+1;});
 const used=new Set(workbook.SheetNames);
 function append(name,items) {
  const base=name.replace(/[\\/?*\[\]:]/g,' ').slice(0,27)||'Branch';let safe=base,n=2;while(used.has(safe))safe=base.slice(0,24)+' '+n++;used.add(safe);
  const sheet=XLSX.utils.aoa_to_sheet([indexes.map(i=>headers[i]),...items.map(row=>indexes.map(i=>row[i]))]);
  sheet['!cols']=indexes.map(i=>({wch:/Name|Department|Position|Location|Branch/.test(headers[i])?28:22}));
  if(items.length)sheet['!autofilter']={ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:items.length,c:indexes.length-1}})};
  indexes.forEach((i,col)=>{for(let r=1;r<=items.length;r++){const cell=sheet[XLSX.utils.encode_cell({r,c:col})];if(!cell)continue;if(/Account|Employee.*No|EmployeeNO|PIN|TIN/i.test(headers[i])){cell.t='s';cell.v=String(cell.v);cell.z='@';}else if(cell.t==='n')cell.z=/Day|S\/No/.test(headers[i])?'0.####':'#,##0.00';}});
  XLSX.utils.book_append_sheet(workbook,sheet,safe);
 }
 append(masterName,sorted);
 const groups=new Map(['Abuja','Lagos','Port Harcourt'].map(name=>[name,[]]));
 for(const row of sorted){const name=row[branchIndex];if(!groups.has(name))groups.set(name,[]);groups.get(name).push(row);}
 for(const [name,items]of groups)append(name,items);
 return indexes;
}
module.exports={selectedIndexes,branchName,compareBranches,appendRegisterSheets};
