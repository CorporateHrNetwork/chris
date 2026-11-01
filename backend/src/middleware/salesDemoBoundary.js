const jwt=require('jsonwebtoken');
const DEMO_IDS=new Set(['chris-demo-org-20261022','chris-client-demo-org-20261025']);
const DEMO_SLUGS=new Set(['chris-demo-company','chris-client-demo-10']);
function salesDemoBoundary(req,res,next){
 const deny=()=>res.status(403).json({status:'error',code:'DEMO_ISOLATION_REQUIRED',message:'This demonstration is restricted to its fictional demo tenants and read-only workspaces.'});
 if(!req.path.startsWith('/api/'))return next();
 if(['/api/auth/login','/api/ess/login'].includes(req.path)&&req.method==='POST'){
  const slug=String(req.body?.organizationSlug||req.body?.organization||'').trim();
  return DEMO_SLUGS.has(slug)?next():deny();
 }
 if(!['GET','HEAD','OPTIONS'].includes(req.method))return deny();
 if(req.method==='OPTIONS')return next();
 if(/^\/api\/(?:internal|platform|commercial|billing|chris-automation)(?:\/|$)/i.test(req.path))return deny();
 if(/\/zermatt(?:\/|$)|\/transport-support(?:\/|$)|\/full-salary-preparation(?:\/|$)|\/performance-evaluation(?:\/|$)|\/employment-resources(?:\/|$)|\/leave-allowance(?:\/|$)/i.test(req.path))return deny();
 try{const match=String(req.headers.authorization||'').match(/^Bearer (.+)$/);if(!match)return deny();const claims=jwt.verify(match[1],process.env.JWT_SECRET,{algorithms:['HS256']});if(!DEMO_IDS.has(claims.organizationId))return deny();for(const key of ['organizationId','organization_id','tenantId']){if(req.query?.[key]&&req.query[key]!==claims.organizationId)return deny();}return next();}catch{return deny();}
}
module.exports={salesDemoBoundary,DEMO_IDS,DEMO_SLUGS};
