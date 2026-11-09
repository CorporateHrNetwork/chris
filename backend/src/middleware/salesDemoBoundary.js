const jwt=require('jsonwebtoken');
const NORTHSTAR_ID = 'chris-demo-org-20261022';
const DEMO_IDS=new Set([NORTHSTAR_ID,'chris-client-demo-org-20261025']);
const DEMO_SLUGS=new Set(['chris-demo-company','chris-client-demo-10']);
function salesDemoBoundary(req,res,next){
 const deny=()=>res.status(403).json({status:'error',code:'DEMO_ISOLATION_REQUIRED',message:'This demonstration is restricted to its fictional demo tenants and read-only workspaces.'});
 if(!req.path.startsWith('/api/'))return next();
 if(['/api/auth/login','/api/ess/login'].includes(req.path)&&req.method==='POST'){
  const slug=String(req.body?.organizationSlug||req.body?.organization||'').trim();
  return DEMO_SLUGS.has(slug)?next():deny();
 }
 // The second demo tenant remains read-only.
 const pricingCatalogue=req.path==='/api/billing/catalogue'&&req.method==='GET';
 const pricingQuote=req.path==='/api/billing/quotes'&&req.method==='POST';
 if(req.method==='OPTIONS')return next();
 if(/^\/api\/(?:internal|platform|commercial|billing|chris-automation)(?:\/|$)/i.test(req.path)&&!pricingCatalogue&&!pricingQuote)return deny();
 if(/\/zermatt(?:\/|$)|\/transport-support(?:\/|$)|\/full-salary-preparation(?:\/|$)|\/performance-evaluation(?:\/|$)|\/employment-resources(?:\/|$)|\/leave-allowance(?:\/|$)/i.test(req.path))return deny();
 try {
  const match = String(req.headers.authorization || '').match(/^Bearer (.+)$/);
  if (!match) return deny();
  const claims = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
  if (!DEMO_IDS.has(claims.organizationId)) return deny();
  const isNorthstarPayrollAction =
   claims.organizationId === NORTHSTAR_ID &&
   claims.accessType !== 'ESS' &&
   req.method === 'POST' &&
   /^\/api\/(?:payroll\/runs\/(?:draft|[\w-]+\/(?:submit|decision|reopen))|attendance\/manual-payroll-inputs)\/?$/i.test(req.path);
  if (!['GET', 'HEAD'].includes(req.method) && !pricingQuote && !isNorthstarPayrollAction) return deny();
  for (const key of ['organizationId', 'organization_id', 'tenantId']) {
   if (req.query?.[key] && req.query[key] !== claims.organizationId) return deny();
   if (req.body?.[key] && req.body[key] !== claims.organizationId) return deny();
  }
  return next();
 } catch {
  return deny();
 }
}
module.exports={salesDemoBoundary,DEMO_IDS,DEMO_SLUGS,NORTHSTAR_ID};
