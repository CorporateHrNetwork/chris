const test=require("node:test");
const assert=require("node:assert/strict");
const {runEngagementDigest,dailyWindow,htmlDigest}=require("../src/services/zermattNewsEngagementDigestService");

const configuredEnv={CHRIS_ENGAGEMENT_EMAIL_ENABLED:"true",RESEND_API_KEY:"test-resend-key",RESEND_FROM:"noreply@example.com"};
function fixture(){
  const calls={sent:[],insert:[],updated:[]};
  const prisma={
    $queryRawUnsafe:async(sql,...args)=>{
      if(sql.includes('FROM "organizations"'))return [{id:"org-test"}];
      if(sql.includes('FROM "internal_news_engagement_settings"'))return [
        {employeeId:"emp-1",email:"employee@example.com",firstName:"Employee",lastName:"One",postId:"post-1",title:"Promotion",reactionCount:4,commentCount:2}
      ];
      if(sql.includes('FROM "internal_news_email_digest_ledger"')&&sql.includes("COUNT"))return [{count:0}];
      if(sql.includes('INSERT INTO "internal_news_email_digest_ledger"')){
        calls.insert.push(args);
        return calls.insert.length===1?[{id:"11111111-1111-4111-8111-111111111111"}]:[];
      }
      return [];
    },
    $executeRawUnsafe:async(sql,...args)=>{calls.updated.push(args);return 1;}
  };
  const fetchImpl=async(url,options)=>{
    calls.sent.push({url,options});
    return {ok:true,status:200,json:async()=>({id:"email-confirmation"})};
  };
  return {calls,prisma,fetchImpl};
}

test("digest aggregates reaction and comment totals into one recipient email without html injection",()=>{
  const html=htmlDigest("<Employee>",[{title:"<unsafe>",reactionCount:2,commentCount:1}]);
  assert.ok(html.includes("&lt;Employee&gt;"));
  assert.ok(html.includes("&lt;unsafe&gt;"));
  assert.ok(!html.includes("<unsafe>"));
});
test("digest day window is Lagos timezone aligned",()=>{
  assert.deepEqual(dailyWindow("2026-11-21"),{
    day:"2026-11-20",start:"2026-11-20T00:00:00+01:00",end:"2026-11-21T00:00:00+01:00"
  });
});
test("default dry run never attempts delivery even when sender is configured",async()=>{
  const x=fixture();
  const result=await runEngagementDigest({prisma:x.prisma,fetchImpl:x.fetchImpl,env:configuredEnv,now:new Date("2026-11-21T12:00:00Z")});
  assert.equal(result.status,"PREVIEW_ONLY");
  assert.equal(result.recipientCount,1);
  assert.equal(x.calls.sent.length,0);
  assert.equal(x.calls.insert.length,0);
});
test("disabled environment switch blocks sending even with dryRun false",async()=>{
  const x=fixture();
  const result=await runEngagementDigest({prisma:x.prisma,fetchImpl:x.fetchImpl,env:{...configuredEnv,CHRIS_ENGAGEMENT_EMAIL_ENABLED:"false"},dryRun:false,now:new Date("2026-11-21T12:00:00Z")});
  assert.equal(result.sent,0);
  assert.equal(x.calls.insert.length,0);
});
test("explicitly enabled execution sends at most one idempotent digest with tracked status",async()=>{
  const x=fixture();
  const result=await runEngagementDigest({prisma:x.prisma,fetchImpl:x.fetchImpl,env:configuredEnv,dryRun:false,now:new Date("2026-11-21T12:00:00Z")});
  assert.equal(result.sent,1);
  assert.equal(x.calls.sent.length,1);
  assert.equal(x.calls.insert.length,1);
  assert.equal(x.calls.updated[0][1],"SENT");
  assert.ok(x.calls.sent[0].options.headers["Idempotency-Key"]);
});
