require("dotenv").config();
const prisma = require("../src/config/prisma");

function monthWindow(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start, end, code: `${start.getUTCFullYear()}-${String(start.getUTCMonth()+1).padStart(2,"0")}` };
}

async function main() {
  const { start, end, code } = monthWindow();
  const organizations = await prisma.organization.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } });
  for (const org of organizations) {
    const existing = await prisma.$queryRawUnsafe(`SELECT "id" FROM "payroll_periods" WHERE "organizationId"=$1 AND "code"=$2 LIMIT 1`, org.id, code);
    if (existing[0]) {
      console.log(`[CHRiS] ${org.name}: ${code} already exists.`);
      continue;
    }
    await prisma.$queryRawUnsafe(
      `INSERT INTO "payroll_periods" ("id","organizationId","code","name","periodStart","periodEnd","payDate","status","createdByUserId")
       VALUES (gen_random_uuid()::text,$1,$2,$3,$4::date,$5::date,NULL,'OPEN',NULL)`,
      org.id, code, `${start.toLocaleString("en-US",{month:"long",year:"numeric"})} Payroll`, start.toISOString().slice(0,10), end.toISOString().slice(0,10)
    );
    console.log(`[CHRiS] ${org.name}: opened ${code}.`);
  }
}

main().catch(error=>{ console.error(error); process.exitCode=1; }).finally(async()=>{ await prisma.$disconnect(); });
