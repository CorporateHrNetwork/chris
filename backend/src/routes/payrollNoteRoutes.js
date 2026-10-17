const express = require('express');
const service = require('../services/payrollNoteWorkflowService');
const router = express.Router(); // mounted behind requireAuth in chrisAutomationRoutes
const handle = fn => async (req,res) => {
  try {return res.json({status:'success',data:await fn(req)});} catch(e) {
    if (!e.statusCode) console.error('Payroll note operation failed:',e);
    return res.status(e.statusCode || 500).json({status:'error',code:e.code || 'PAYROLL_NOTE_FAILED',message:e.statusCode ? e.message : 'Unable to complete payroll note operation. Please retry.'});
  }
};
const revision = req => {
  if (!Number.isInteger(req.body?.revision)) {const e=new Error('Refresh the note before continuing.');e.statusCode=409;throw e;}
  return req.body;
};
router.get('/',handle(req=>service.list({req})));
router.get('/options',handle(req=>service.options({req})));
router.post('/suggest',handle(req=>service.suggest({req,input:req.body || {}})));
router.post('/',handle(req=>service.submit({req,input:req.body || {}})));
router.get('/:id',handle(req=>service.detail({req,id:req.params.id})));
router.patch('/:id/review',handle(req=>service.review({req,id:req.params.id,input:revision(req)})));
router.post('/:id/preview',handle(req=>service.preview({req,id:req.params.id,input:revision(req)})));
router.post('/:id/implement',handle(req=>service.implement({req,id:req.params.id,input:revision(req)})));
router.post('/:id/audit-review',handle(req=>service.audit({req,id:req.params.id,input:revision(req)})));
module.exports=router;
