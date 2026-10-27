const express=require('express');
const multer=require('multer');
const prisma=require('../config/prisma');
const {requireAnyPermission}=require('../middleware/authMiddleware');
const service=require('../services/workedDaysBulkService');
const router=express.Router();
router.use(requireAnyPermission('attendance.manage','payroll.manage'));
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1}});
function receive(req,res,next) {upload.single('file')(req,res,error=>error ? res.status(400).json({status:'error',message:'Upload one Excel file of up to 5 MB.'}) : next());}
function errorResponse(error,res) {return res.status(error.code==='P2034'?409:(error.statusCode || 500)).json({status:'error',message:error.code==='P2034'?'Payroll inputs changed concurrently. Validate / Preview again.':error.statusCode?error.message:'Unable to process bulk worked days. No rows were imported.'});}
router.get('/template',async(req,res)=>{try {
  const buffer=await service.template(prisma,req.auth,req.query.payrollPeriodId);
  res.set({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="CHRiS_Worked_Days_Bulk_Template.xlsx"','Cache-Control':'no-store'});return res.send(buffer);
}catch(error){return errorResponse(error,res);}});
router.post('/preview',receive,async(req,res)=>{try {
  const result=await service.prepare(prisma,req.auth,req.body.payrollPeriodId,req.file?.buffer);
  return res.json({status:'success',data:result.data});
}catch(error){return errorResponse(error,res);}});
router.post('/import',receive,async(req,res)=>{try {
  const data=await service.importWorkbook(prisma,req.auth,req.body.payrollPeriodId,req.file?.buffer,req.body.previewToken);
  return res.json({status:'success',message:'Worked days imported. Head HR must recalculate the affected draft payroll before submission.',data});
}catch(error){return errorResponse(error,res);}});
module.exports=router;
