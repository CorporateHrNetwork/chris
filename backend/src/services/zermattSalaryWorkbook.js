const XLSX=require('xlsx');
function readWorkbook(buffer){
 const workbook=XLSX.read(buffer,{type:'buffer',cellDates:false,sheetRows:2002});
 const sheet=workbook.Sheets['Full Salaries'];
 if(!sheet){const e=new Error('Use the Full Salaries sheet from the generated template.');e.statusCode=400;throw e;}
 const rows=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true});
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
