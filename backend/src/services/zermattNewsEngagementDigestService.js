const crypto = require("crypto");
const prismaDefault = () => require("../config/prisma");
const {deliveryConfiguration} = require("./zermattCelebrationNotificationService");

const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const text = v => String(v ?? "").trim();
function lagosDate(now=new Date()){
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Africa/Lagos",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const x=Object.fromEntries(parts.filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  return x.year+"-"+x.month+"-"+x.day;
}
function dayBefore(day){
  const date=new Date(day+"T00:00:00Z");
  if(!Number.isFinite(date.getTime()))throw Error("INVALID_DIGEST_DAY");
  date.setUTCDate(date.getUTCDate()-1);
  return date.toISOString().slice(0,10);
}
function htmlDigest(recipient,entries){
  const content=entries.map(entry=>
    '<li style="margin:12px 0"><strong>'+esc(entry.title)+'</strong>: '+
    Number(entry.reactionCount||0)+' reactions, '+Number(entry.commentCount||0)+' comments</li>').join("");
  return '<!doctype html><html><body style="font-family:Arial,sans-serif;color:#183a2a;background:#f7f8f4;padding:24px">'+
    '<main style="background:#fff;padding:22px;margin:auto;max-width:600px;border:1px solid #d4af37;border-radius:12px">'+
    '<h2>Zermatt colleagues are celebrating you</h2><p>Dear '+esc(recipient)+',</p>'+
    '<p>Your colleagues have engaged with announcements recognising you:</p><ul>'+content+'</ul>'+
    '<p><a href="https://chris-zermatt-web.onrender.com/ess">View your messages securely in CHRiS ESS</a></p>'+
    '<small>Powered by CHRiS. You can disable engagement email digests in ESS.</small></main></body></html>';
}
function dailyWindow(today=lagosDate()){
  const day=dayBefore(today);
  return {day,start:day+"T00:00:00+01:00",end:today+"T00:00:00+01:00"};
}
async function recipients({prisma=prismaDefault(),organizationId,start,end}){
  return prisma.$queryRawUnsafe(
    `SELECT s."recognizedEmployeeId" AS "employeeId",e."email",e."firstName",e."lastName",
       p."id" AS "postId",p."title",
       (SELECT COUNT(*)::int FROM "internal_news_reactions" r
         WHERE r."organizationId"=p."organizationId" AND r."postId"=p."id"
           AND r."updatedAt">=$2::timestamptz AND r."updatedAt"<$3::timestamptz) AS "reactionCount",
       (SELECT COUNT(*)::int FROM "internal_news_comments" c
         WHERE c."organizationId"=p."organizationId" AND c."postId"=p."id" AND NOT c."isHidden"
           AND c."createdAt">=$2::timestamptz AND c."createdAt"<$3::timestamptz) AS "commentCount"
       FROM "internal_news_engagement_settings" s
       JOIN "internal_news_posts" p ON p."organizationId"=s."organizationId" AND p."id"=s."postId"
       JOIN "employees" e ON e."organizationId"=s."organizationId" AND e."id"=s."recognizedEmployeeId"
       JOIN "internal_news_email_preferences" pref ON pref."organizationId"=s."organizationId"
            AND pref."employeeId"=s."recognizedEmployeeId" AND pref."optIn"=TRUE
      WHERE s."organizationId"=$1 AND s."enabled"=TRUE AND s."notifyByEmail"=TRUE
        AND p."status"='PUBLISHED' AND (p."publishAt" IS NULL OR p."publishAt"<$3::timestamptz)
        AND (p."expireAt" IS NULL OR p."expireAt">=$2::timestamptz)
        AND e."status" IN ('ACTIVE','PROBATION','LEAVE') AND e."email" IS NOT NULL
      ORDER BY s."recognizedEmployeeId",p."title"`,
    organizationId,start,end);
}
async function runEngagementDigest({prisma=prismaDefault(),env=process.env,fetchImpl=fetch,now=new Date(),dryRun=true}={}){
  const orgs=await prisma.$queryRawUnsafe(
    'SELECT "id" FROM "organizations" WHERE "slug"=$1 AND "status"=$2 LIMIT 1',"zermatt-liquor-limited","ACTIVE");
  if(!orgs.length)return {status:"ORGANIZATION_UNAVAILABLE",sent:0};
  const orgId=String(orgs[0].id);
  const {day,start,end}=dailyWindow(lagosDate(now));
  const rows=await recipients({prisma,organizationId:orgId,start,end});
  const grouped=new Map();
  for(const row of rows){
    if(Number(row.reactionCount)+Number(row.commentCount)<1)continue;
    const id=String(row.employeeId);
    if(!grouped.has(id))grouped.set(id,{name:[row.firstName,row.lastName].filter(Boolean).join(" "),email:text(row.email),entries:[]});
    grouped.get(id).entries.push(row);
  }
  const {from,emailConfigured}=deliveryConfiguration(env);
  const operational=env.CHRIS_ENGAGEMENT_EMAIL_ENABLED==="true" && emailConfigured && !dryRun;
  if(!operational)return {status:"PREVIEW_ONLY",day,recipientCount:grouped.size,sent:0,emailConfigured,activated:env.CHRIS_ENGAGEMENT_EMAIL_ENABLED==="true"};
  const prior=await prisma.$queryRawUnsafe(
    'SELECT COUNT(*)::int AS "count" FROM "internal_news_email_digest_ledger" WHERE "digestDate"=$1::date AND "status" IN (\'PROCESSING\',\'SENT\',\'RECONCILE_REQUIRED\')',day);
  // Keep headroom for other transactional emails in the provider's free daily allowance.
  let remaining=Math.max(0,90-Number(prior[0]?.count||0));
  let sent=0,uncertain=0,skipped=0;
  for(const [employeeId,item] of grouped){
    if(!remaining){skipped++;continue;}
    const claimed=await prisma.$queryRawUnsafe(
      `INSERT INTO "internal_news_email_digest_ledger" ("id","organizationId","employeeId","digestDate","email","messageCount")
       VALUES ($1::uuid,$2,$3,$4::date,$5,$6)
       ON CONFLICT ("organizationId","employeeId","digestDate") DO NOTHING RETURNING "id"`,
      crypto.randomUUID(),orgId,employeeId,day,item.email,item.entries.reduce((n,x)=>n+Number(x.reactionCount||0)+Number(x.commentCount||0),0));
    if(!claimed.length){skipped++;continue;}
    remaining--;
    const claimId=claimed[0].id;
    let status="RECONCILE_REQUIRED",providerId=null,errorText=null;
    try{
      const subject="Your colleagues are celebrating you | "+day;
      const response=await fetchImpl("https://api.resend.com/emails",{
        method:"POST",signal:AbortSignal.timeout(15000),
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+text(env.RESEND_API_KEY),
          "Idempotency-Key":crypto.createHash("sha256").update(orgId+"|"+employeeId+"|"+day+"|ENGAGEMENT").digest("hex")},
        body:JSON.stringify({from,to:[item.email],subject,html:htmlDigest(item.name,item.entries),
          text:"Your colleagues have reacted to your recognition announcements. Visit CHRiS ESS to see their messages."})
      });
      const result=await response.json().catch(()=>({}));
      if(response.ok && result.id){status="SENT";providerId=result.id;sent++;}
      else{errorText="PROVIDER_HTTP_"+response.status;uncertain++;}
    }catch(e){errorText=String(e.message||"PROVIDER_EXCEPTION").slice(0,120);uncertain++;}
    await prisma.$executeRawUnsafe(
      'UPDATE "internal_news_email_digest_ledger" SET "status"=$2,"providerMessageId"=$3,"error"=$4,"updatedAt"=CURRENT_TIMESTAMP WHERE "id"=$1::uuid',
      claimId,status,providerId,errorText);
  }
  return {status:uncertain?"RECONCILIATION_REQUIRED":"COMPLETE",day,recipientCount:grouped.size,sent,uncertain,skipped};
}
module.exports={lagosDate,dayBefore,dailyWindow,htmlDigest,runEngagementDigest};
