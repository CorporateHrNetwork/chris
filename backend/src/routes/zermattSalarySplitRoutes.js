const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { isZermatt, isHeadHr } = require('../services/zermattHrFinancialAccessService');
const { prepareSalaryRows: prepare } = require('../services/zermattSalarySplit');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024 } });
router.use(requireAuth, requirePermission('payroll.manage'));
router.use((req,res,next)=> {
  if (!isZermatt(req) || !isHeadHr(req)) return res.status(403).json({status:'error',message:'This salary preparation portal is restricted to Zermatt Head HR.'});
  next();
});
const headers = ['Employee No','Full Monthly Gross Salary','Currency','Effective From','Reason'];
function error(res,e) { return res.status(e.statusCode||400).json({status:'error',code:e.code||'SALARY_SPLIT_ERROR',message:e.statusCode ? e.message : 'Unable to complete salary preparation. Check the workbook and try again.'}); }
function invalid(message) { const e=new Error(message); e.statusCode=400; throw e; }
async function employees(client,organizationId) {
  return client.employee.findMany({where:{organizationId,status:{in:['ACTIVE','PROBATION','LEAVE','SUSPENDED']}},select:{id:true,employeeNumber:true,employmentType:true,hireDate:true},orderBy:{employeeNumber:'asc'}});
}

function readWorkbook(buffer) {
  const workbook=XLSX.read(buffer,{type:'buffer',cellDates:false,sheetRows:2002});
  const sheet=workbook.Sheets['Full Salaries'];
  if (!sheet) invalid('Use the Full Salaries sheet from the generated template.');
  const values=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:false});
  return values;
}
function digest(rows) { return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'); }
router.get('/template',async(req,res)=>{
  try {
    const staff=await employees(prisma,req.auth.organizationId);
    const workbook=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([headers,...staff.map(e=>[e.employeeNumber,'','NGN','',''])]),'Full Salaries');
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
      ['CHRiS Zermatt Full Salary Preparation'],
      ['Enter FULL agreed monthly gross. Do not enter the reduced end-of-month amount.'],
      ['Employment Type and hire date are read from authoritative employee records.'],
      ['Effective From: YYYY-MM-01; Reason is required.'],
      ['Full-time >= ₦100,000: 25% mid-month, 75% end-month. Below ₦100,000: 16% and 84%.'],
      ['Other employment types: no mid-month; 100% end-month.'],
      ['The preview prorates eligible full-time new hires over the inclusive 1st–15th period.'],
      ['Mid-month loan recovery: ZERO. Previous unpaid and previous overpaid belong to the separate reconciliation ledger.'],
      ['This import prepares salaries for review. It does not activate payroll or change approved payroll.'],
      ['Leave the sheet name and column headers unchanged. Remove rows for employees you are not uploading.'],
    ]),'Instructions');
    res.setHeader('Content-Disposition','attachment; filename="CHRiS_Zermatt_Full_Salaries_Template.xlsx"');
    res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}));
  } catch(e) { return error(res,e); }
});
router.post('/preview',upload.single('file'),async(req,res)=>{
  try {
    if (!req.file?.buffer) invalid('Select a completed template.');
    const rows=prepare(readWorkbook(req.file.buffer),await employees(prisma,req.auth.organizationId));
    return res.json({status:'success',data:{rows,previewToken:digest(rows),validRows:rows.filter(r=>r.valid).length,invalidRows:rows.filter(r=>!r.valid).length}});
  } catch(e) { return error(res,e); }
});
router.post('/import',upload.single('file'),async(req,res)=>{
  try {
    if (process.env.CHRIS_ZERMATT_SALARY_PREPARATION_ENABLED!=='true') { const e=new Error('Salary preparation imports are awaiting deployment verification. Template generation and preview remain available.'); e.statusCode=409; throw e; }
    if (!req.file?.buffer) invalid('Select the validated template.');
    const source=readWorkbook(req.file.buffer);
    const imported=await prisma.$transaction(async tx=>{
      // Employee locks prevent employment type / hire-date edits between revalidation and import.
      await tx.$queryRawUnsafe('SELECT id FROM public.employees WHERE "organizationId"=$1 ORDER BY id FOR UPDATE',req.auth.organizationId);
      const rows=prepare(source,await employees(tx,req.auth.organizationId));
      if (rows.some(r=>!r.valid)) invalid('Resolve every validation error before importing. No rows were imported.');
      if (req.body?.previewToken!==digest(rows)) invalid('The workbook or employee records changed. Preview the upload again.');
      const batchId=crypto.randomUUID();
      for(const row of rows) {
        await tx.$executeRawUnsafe(`INSERT INTO public.zermatt_salary_split_preparations
          (id,"organizationId","employeeId","fullMonthlyGross",currency,"effectiveFrom",reason,"employmentTypeSnapshot","hireDateSnapshot","allocationPreview","createdByUserId")
          VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,$9::date,$10::jsonb,$11)`,crypto.randomUUID(),req.auth.organizationId,row.employeeId,row.amount,row.currency,row.effectiveFrom,row.reason,row.employmentType,row.hireDate,JSON.stringify(row.allocation),req.auth.userId);
      }
      await tx.organizationAudit.create({data:{organizationId:req.auth.organizationId,actorUserId:req.auth.userId,entityType:'SalarySplitPreparation',entityId:batchId,action:'IMPORTED_FOR_REVIEW',newValue:{count:rows.length,status:'PENDING_ACTIVATION'},reason:'Full salaries prepared; regular payroll and loan balances unchanged.'}});
      return rows.length;
    },{timeout:30000});
    return res.status(201).json({status:'success',data:{imported,status:'PENDING_ACTIVATION'},message:'Full salaries imported for review. Payroll activation has not occurred.'});
  } catch(e) { return error(res,e); }
});
router.get('/',async(req,res)=>{
  try {
    if (process.env.CHRIS_ZERMATT_SALARY_PREPARATION_ENABLED!=='true') return res.json({status:'success',data:[],preparationEnabled:false});
    const rows=await prisma.$queryRawUnsafe(`SELECT s.id,e."employeeNumber",s."fullMonthlyGross",s.currency,s."effectiveFrom",s.status,s."allocationPreview" FROM public.zermatt_salary_split_preparations s JOIN public.employees e ON e.id=s."employeeId" AND e."organizationId"=s."organizationId" WHERE s."organizationId"=$1 ORDER BY s."effectiveFrom" DESC,e."employeeNumber" LIMIT 2000`,req.auth.organizationId);
    return res.json({status:'success',data:rows,preparationEnabled:true});
  } catch(e) { return error(res,e); }
});
module.exports = { router, prepare };
