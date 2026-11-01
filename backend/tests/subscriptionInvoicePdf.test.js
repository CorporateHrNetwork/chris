'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {calculateQuote}=require('../src/services/subscriptionPricing');
const {pdfInvoice}=require('../src/services/subscriptionInvoicePdf');
test('Generated PDF is validly framed and includes core invoice references',()=>{
 const quote=calculateQuote({planId:'standard',employeeCount:320});
 const invoice={quote,invoiceNumber:'CHRIS-PF-TEST-001',issuedAt:'2026-10-12T00:00:00Z',companyName:'Zermatt Liquor Limited'};
 const pdf=pdfInvoice(invoice);
 assert.equal(pdf.subarray(0,8).toString(),'%PDF-1.4');
 assert.ok(pdf.toString().includes('CHRIS-PF-TEST-001'));
 assert.ok(pdf.toString().includes('Zermatt Liquor Limited'));
 assert.ok(pdf.toString().includes('7,774,400'));
 assert.ok(pdf.toString().includes('startxref'));
});
