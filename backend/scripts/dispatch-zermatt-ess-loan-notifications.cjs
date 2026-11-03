"use strict";
require("dotenv").config();
const db=require("../src/config/prisma");
async function main(){
 if(process.env.ZERMATT_ESS_APPROVALS_ENABLED!=="true")throw Error("ESS loan workflow is disabled");
 const org=await db.organization.findUnique({where:{slug:"zermatt-liquor-limited"},select:{id:true}});
 if(!org)throw Error("Zermatt organization not found");
 const results=await require("../src/services/zermattEssLoanNotificationDispatch").dispatch(db,{organizationId:org.id});
 console.log(JSON.stringify(results.map(({id,status,reason})=>({id,status,reason}))));
}
main().catch(error=>{console.error(error.code||error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
