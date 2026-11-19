const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"../..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");

test("salary to words handles Naira and Kobo with numeric validation",()=>{
  const source=read("src/utils/nairaToWords.js").replace("export function nairaToWords","function nairaToWords");
  const context={}; vm.runInNewContext(source+";this.convert=nairaToWords;",context);
  assert.equal(context.convert("₦90,000"),"Ninety Thousand Naira Only");
  assert.equal(context.convert("125000.50"),"One Hundred and Twenty Five Thousand Naira and Fifty Kobo Only");
  assert.equal(context.convert("0"),"Zero Naira Only");
  assert.equal(context.convert("not a salary"),"");
});
test("reference is generated on server using a DB sequence and unique employee-letter-date key",()=>{
  const sql=read("backend/prisma/migrations/20261119210000_zermatt_offer_reference_generator/migration.sql");
  const routes=read("backend/src/routes/zermattOfferTermsRoutes.js");
  assert.ok(sql.includes("CREATE SEQUENCE"));
  assert.ok(sql.includes('UNIQUE("organizationId","employeeId","letterDate")'));
  assert.ok(routes.includes('router.post("/reference"'));
  assert.ok(routes.includes("nextval('public.zermatt_offer_reference_seq')"));
  assert.ok(routes.includes("ON CONFLICT"));
  assert.ok(routes.includes("scopedLocationWhere(req)"));
  assert.ok(routes.includes('router.get("/managers/search"'));
});
test("offer composer has automatic reference and salary words, searchable reporting manager and opt-in signature attachment",()=>{
  const ui=read("src/pages/documents/ZermattOfferLetterComposer.jsx");
  assert.ok(ui.includes('readOnly={key === "offer_reference_number" || key === "salary_amount_in_words"}'));
  assert.ok(ui.includes('salary_amount_in_words: nairaToWords(e.target.value)'));
  assert.ok(ui.includes('apiRequest("/api/zermatt/offer-terms/reference"'));
  assert.ok(ui.includes("/api/zermatt/offer-terms/managers/search?name="));
  assert.ok(ui.includes("setSelectedManagerId(person.id)"));
  assert.ok(ui.includes('type="file" accept="image/png,image/jpeg"'));
  assert.ok(ui.includes("signatureAuthorized ? signatureDataUrl :"));
  assert.ok(!ui.includes('src="/signature"'));
});
