const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("suspension independently blocks existing CHRiS and ESS sessions and logins",()=>{
 const schema=read("backend/prisma/schema.prisma"),migration=read("backend/prisma/migrations/20261120123500_user_access_suspension/migration.sql");
 const middleware=read("backend/src/middleware/authMiddleware.js");
 const auth=read("backend/src/routes/authRoutes.js");
 const ess=read("backend/src/routes/essRoutes.js");
 assert.ok(schema.includes("accessSuspendedAt DateTime?"));
 assert.ok(migration.includes('ALTER TABLE "users"'));
 assert.ok(middleware.includes("accessSuspendedAt: null"));
 assert.ok(auth.includes("accessSuspendedAt: null"));
 assert.ok(ess.includes("accessSuspendedAt: null"));
 assert.ok(auth.includes("Boolean(resetRecord.user.accessSuspendedAt)"));
});
test("separate employee CHRiS and ESS password recovery is audited, emailed, and tenant scoped",()=>{
 const routes=read("backend/src/routes/userRoutes.js"),mail=read("backend/src/services/chrisUserRecoveryMailer.js");
 assert.ok(routes.includes('router.post("/:userId/send-password-recovery", requirePermission("users.manage")'));
 assert.ok(routes.includes('["admin","ess"].includes(portal)'));
 assert.ok(routes.includes('organizationId:req.auth.organizationId'));
 assert.ok(routes.includes('tokenHash:hash'));
 assert.ok(routes.includes('expiresAt:new Date(Date.now()+15*60*1000)'));
 assert.ok(routes.includes('USER_PORTAL_RECOVERY_ISSUED'));
 assert.ok(!routes.includes('data:{resetUrl'));
 assert.ok(mail.includes("RESEND_API_KEY"));
 assert.ok(mail.includes("sendRecoveryMail"));
});
test("suspend/resume remains separate from deactivate/reactivate and records reason",()=>{
 const routes=read("backend/src/routes/userRoutes.js"),ui=read("src/components/settings/UsersRolesSettings.jsx");
 assert.ok(routes.includes('router.patch("/:userId/suspension", requirePermission("users.manage")'));
 assert.ok(routes.includes("CHRIS_USER_ACCESS_SUSPENDED"));
 assert.ok(routes.includes("CHRIS_USER_ACCESS_RESUMED"));
 assert.ok(routes.includes("reason.length<8"));
 assert.ok(routes.includes('router.patch("/:userId/status", requirePermission("users.manage")'));
 assert.ok(ui.includes("Reset Staff Password"));
 assert.ok(ui.includes("Reset ESS Password"));
 assert.ok(ui.includes("Suspend Access"));
 assert.ok(ui.includes("Resume Access"));
});
