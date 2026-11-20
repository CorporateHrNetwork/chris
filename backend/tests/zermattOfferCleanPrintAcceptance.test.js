const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const ui=fs.readFileSync(path.resolve(__dirname,"../../src/pages/documents/ZermattOfferLetterComposer.jsx"),"utf8");
const print=ui.slice(ui.indexOf("function createPrintDocument("),ui.indexOf("export default function"));
test("offer PDF removes typed company banner and printed draft marks while retaining official Zermatt logo",()=>{
 assert.ok(print.includes('img.src = brandingLogo'));
 assert.ok(ui.includes('new URL("/zrt-logo.jpeg"'));
 assert.ok(!print.includes('el("div", "ZERMATT LIQUOR LIMITED"'));
 assert.ok(!print.includes('DRAFT — REVIEW AND AUTHORIZE BEFORE ISSUE'));
 assert.ok(!print.includes('HR Draft'));
 assert.ok(print.includes('el("h1", "OFFER OF EMPLOYMENT")'));
});
test("A4 print layout suppresses browser header/footer print margins and does not inject URLs or timestamps",()=>{
 assert.ok(print.includes('@page{size:A4;margin:0}'));
 assert.ok(print.includes('padding:16mm 17mm'));
 assert.ok(!print.includes('window.location.href'));
 assert.ok(!print.includes('Date.now()'));
 assert.ok(ui.includes('turn off <strong>Headers and footers</strong>'));
});
test("printing requires authoritative employee fields and complete logo before rendering",()=>{
 assert.ok(ui.includes('!terms || missing.length || referenceLoading || !selectedManagerId'));
 assert.ok(ui.includes('if (!img.complete || img.naturalWidth === 0)'));
 assert.ok(ui.includes('Printing does not approve, sign, issue or archive the letter'));
});
