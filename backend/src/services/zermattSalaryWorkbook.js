const XLSX=require('xlsx');
const COLUMNS=['Employee No','Employee Name (reference)','Branch (reference)','Full Monthly Gross Salary','Currency','Effective From','Reason','Employment Type (reference)','Hire Date (reference)'];
const normalize=value=>String(value??'').replace(/\u00a0/g,' ').trim().replace(/\s+/g,' ').toLowerCase();
function workbookError(message){const e=new Error(message);e.statusCode=400;throw e;}
function readWorkbook(buffer){
 const workbook=XLSX.read(buffer,{type:'buffer',cellDates:false,sheetRows:2002});
 const sheet=workbook.Sheets['Full Salaries'];
 if(!sheet)workbookError('Use the Full Salaries sheet from the generated template.');
 // Read raw header values: accounting formats can add padding to displayed text.
 const [header=[],...values]=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true,blankrows:false});
 const canonical=new Map(COLUMNS.map(name=>[normalize(name),name]));
 const seen=new Set();
 const columns=header.map(value=>{
  const key=normalize(value);
  if(!key)return null;
  if(seen.has(key))workbookError('Duplicate column heading: '+String(value).trim()+'.');
  seen.add(key);
  return canonical.get(key)||String(value).trim();
 });
 for(const name of ['Employee No','Full Monthly Gross Salary','Effective From','Reason']){
  if(!columns.includes(name))workbookError('Missing required column: '+name+'. Use the generated template.');
 }
 const rows=values.filter(row=>row.some(value=>value!==''&&value!=null)).map(row=>Object.fromEntries(columns.flatMap((key,index)=>key?[[key,row[index]??'']]:[])));
 for(const row of rows){
  const value=row['Effective From'];
  if(typeof value==='number' && Number.isInteger(value) && value>60){
   const parts=XLSX.SSF.parse_date_code(value,{date1904:workbook.Workbook?.WBProps?.date1904===true});
   if(parts && parts.y>=1900 && parts.y<=9999)row['Effective From']=`${String(parts.y).padStart(4,'0')}-${String(parts.m).padStart(2,'0')}-${String(parts.d).padStart(2,'0')}`;
  }
 }
 return rows;
}
module.exports={readWorkbook};
