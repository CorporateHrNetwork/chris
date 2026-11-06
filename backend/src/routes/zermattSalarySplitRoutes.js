const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { requireAuth, requirePermission } = require('../middleware/authMiddleware');
const { isZermatt, isHeadHr } = require('../services/zermattHrFinancialAccessService');
const { prepareSalaryRows: prepare } = require('../services/zermattSalarySplit');
const {readWorkbook}=require('../services/zermattSalaryWorkbook');
const {savePreparedSalaryRows}=require('../services/zermattSalaryBulkPreparationService');
const {preparationEnabled,storageReady,assertPreparationReady}=require('../services/zermattBenefitPreparationReadiness');
const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5*1024*1024 } });
router.use(requireAuth, requirePermission('payroll.manage'));
router.use((req,res,next)=> {
  if (!isZermatt(req) || !isHeadHr(req)) return res.status(403).json({status:'error',message:'This salary preparation portal is restricted to Zermatt Head HR.'});
  next();
});
const headers = ['Employee No','Employee Name (reference)','Branch (reference)','Full Monthly Gross Salary','Currency','Effective From','Reason','Employment Type (reference)','Hire Date (reference)'];
function error(res,e) {
 if(e.statusCode)return res.status(e.statusCode).json({status:'error',code:e.code||'SALARY_SPLIT_ERROR',message:e.message});
 const reference=crypto.randomUUID();
 console.error('CHRIS_BENEFIT_PREPARATION_ERROR',JSON.stringify({reference,code:e.code||'UNEXPECTED',databaseCode:e.meta?.code||e.meta?.driverAdapterError?.cause?.originalCode||null}));
 return res.status(500).json({status:'error',code:'BENEFIT_PREPARATION_SAVE_FAILED',message:`Unable to complete benefit preparation. Please retry or contact support. Reference: ${reference}`});
}
function invalid(message) { const e=new Error(message); e.statusCode=400; throw e; }
async function employees(client,organizationId) {
  return client.employee.findMany({where:{organizationId,status:{in:['ACTIVE','PROBATION','LEAVE','SUSPENDED']}},select:{id:true,employeeNumber:true,firstName:true,middleName:true,lastName:true,employmentType:true,hireDate:true,location:{select:{name:true}}},orderBy:{employeeNumber:'asc'}});
}

const individual=require('../services/zermattSalaryPreparationService').createService(prisma,employees,{benefitsOnly:true});
router.get('/employees',async(req,res)=>{
  try { const staff=await employees(prisma,req.auth.organizationId);return res.json({status:'success',data:staff.map(e=>({employeeNumber:e.employeeNumber,employeeName:[e.firstName,e.middleName,e.lastName].filter(Boolean).join(' '),branch:e.location?.name||'Unassigned'}))}); } catch(e){return error(res,e);}
});
router.post('/individual/preview',async(req,res)=>{
  try {return res.json({status:'success',data:await individual.preview(req.auth.organizationId,req.auth.userId,req.body||{})});} catch(e){return error(res,e);}
});
router.post('/individual',async(req,res)=>{
  try {
    await assertPreparationReady(prisma);
    return res.json({status:'success',data:await individual.save(req.auth.organizationId,req.auth.userId,req.body||{}),message:'Individual full salary saved for review. Payroll has not been activated.'});
  } catch(e){return error(res,e);}
});
function digest(rows) { return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'); }
router.get('/template',async(req,res)=>{
  try {
    const staff=await employees(prisma,req.auth.organizationId);
    const workbook=XLSX.utils.book_new();
    const sheet=XLSX.utils.aoa_to_sheet([headers,...staff.map(e=>[e.employeeNumber,[e.firstName,e.middleName,e.lastName].filter(Boolean).join(' '),e.location?.name||'Unassigned','', 'NGN','','Opening full salary upload',e.employmentType,e.hireDate?new Date(e.hireDate).toISOString().slice(0,10):''])]);
    sheet['!cols']=[18,46,24,27,12,19,34,24,21].map(wch=>({wch}));
    XLSX.utils.book_append_sheet(workbook,sheet,'Full Salaries');
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([
      ['CHRiS Zermatt Full Salary Preparation'],
      ['Enter FULL agreed monthly gross. Do not enter the reduced end-of-month amount.'],
      ['Employment Type and hire date are read from authoritative employee records.'],
      ['Employee Name, Branch, Employment Type and Hire Date reference columns identify records; editing them does not change CHRiS employee authority.'],
      ['Effective From: YYYY-MM-01; Reason is required.'],
      ['Transport support for full-time employees: 25% of the reviewed basis at ₦100,000 or above; 16% below ₦100,000. Regular salary is unchanged.'],
      ['Other employment types: no transport support under this policy. Regular salary is unchanged.'],
      ['The preview prorates eligible full-time new hires over the inclusive 1st–15th period.'],
      ['Mid-month loan recovery: ZERO. Previous unpaid and previous overpaid belong to the separate reconciliation ledger.'],
      ['This import stores the transport-benefit calculation basis only. It does not change salary rates or regular payroll.'],
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
    await assertPreparationReady(prisma);
    if (!req.file?.buffer) invalid('Select the validated template.');
    const source=readWorkbook(req.file.buffer);
    const imported=await savePreparedSalaryRows(prisma,{
      organizationId:req.auth.organizationId,actorUserId:req.auth.userId,
      source,previewToken:req.body?.previewToken,loadEmployees:employees,
    });
    return res.status(201).json({status:'success',data:{imported,status:'PENDING_ACTIVATION'},message:'Full salaries imported for review. Payroll activation has not occurred.'});
  } catch(e) { return error(res,e); }
});
router.get('/',async(req,res)=>{
  try {
    const schemaReady=await storageReady(prisma);
    if (!schemaReady||!preparationEnabled()) return res.json({status:'success',data:[],preparationEnabled:false,preparationStatus:schemaReady?'AWAITING_RELEASE':'STORAGE_NOT_READY'});
    const rows=await prisma.$queryRawUnsafe(`SELECT s.id,e."employeeNumber",CONCAT_WS(' ',e."firstName",e."middleName",e."lastName") AS "employeeName",l.name AS branch,s."fullMonthlyGross",s.currency,s.reason,s."effectiveFrom",s.status,s."activatedAt",s."allocationPreview" FROM public.zermatt_salary_split_preparations s JOIN public.employees e ON e.id=s."employeeId" AND e."organizationId"=s."organizationId" LEFT JOIN public.organization_locations l ON l.id=e."locationId" AND l."organizationId"=e."organizationId" WHERE s."organizationId"=$1 ORDER BY s."effectiveFrom" DESC,e."employeeNumber" LIMIT 2000`,req.auth.organizationId);
    return res.json({status:'success',data:rows,preparationEnabled:true});
  } catch(e) { return error(res,e); }
});
module.exports = { router, prepare };

