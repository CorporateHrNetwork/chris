const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const prismaPath=require.resolve("../src/config/prisma");
require.cache[prismaPath]={id:prismaPath,filename:prismaPath,loaded:true,exports:{}};
const {requirePermission}=require("../src/middleware/authMiddleware");
async function check(permission,auth) {
 const req={auth},res={statusCode:200,body:null,status(v){this.statusCode=v;return this;},json(v){this.body=v;return this;}};
 let allowed=false;requirePermission(permission)(req,res,()=>{allowed=true});
 return {allowed,code:res.statusCode};
}
test("staff accounts cannot access employee-news management permission",async()=>{
 const user={organization:{slug:"zermatt-liquor-limited"},permissions:["employees.view"]};
 assert.deepEqual(await check("employees.update",user),{allowed:false,code:403});
});
test("HR users require explicit employees.update permission for comment moderation",async()=>{
 const user={organization:{slug:"zermatt-liquor-limited"},permissions:["employees.update","employees.view"]};
 assert.equal((await check("employees.update",user)).allowed,true);
 assert.equal((await check("employees.view",user)).allowed,true);
});
test("engagement admin routes all declare permissions before handlers",()=>{
 const file=fs.readFileSync(path.join(__dirname,"../src/routes/internalNewsEngagementRoutes.js"),"utf8");
 for(const segment of [
  'adminRouter.put("/:postId/settings",requireAuth,requirePermission("employees.update")',
  'adminRouter.patch("/:postId/comments/:id/hide",requireAuth,requirePermission("employees.update")',
  'adminRouter.get("/:postId/moderation",requireAuth,requirePermission("employees.view")',
  'adminRouter.get("/recipient-search",requireAuth,requirePermission("employees.view")'
 ])assert.ok(file.includes(segment),segment);
});
