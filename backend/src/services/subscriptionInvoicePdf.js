'use strict';
function pdfInvoice(invoice) {
  const q=invoice.quote;
  const lines=[
    'CORPORATE RESOURCES NETWORK','CorporateHr Network | CHRiS - People | Performance | Rewards',
    'PRO FORMA INVOICE', 'Invoice: '+invoice.invoiceNumber,
    'Issued: '+invoice.issuedAt.slice(0,10), 'Bill to: '+invoice.companyName,
    'Plan: '+q.planId.toUpperCase()+' | Employees: '+q.employeeCount,
    'Licence (12 months): NGN '+q.lineItems.licence.toLocaleString('en-NG'),
    'Employee Self-Service (12 months): NGN '+q.lineItems.ess.toLocaleString('en-NG'),
    'Onboarding (one-time): NGN '+q.lineItems.onboarding.toLocaleString('en-NG'),
    'Technical Support (annual): NGN '+q.lineItems.support.toLocaleString('en-NG'),
    'Subtotal: NGN '+q.subtotal.toLocaleString('en-NG'),
    'VAT ('+(q.vatBasisPoints/100)+'%): NGN '+q.vat.toLocaleString('en-NG'),
    'TOTAL: NGN '+q.total.toLocaleString('en-NG'),
    'PAYMENT DETAILS', 'Zenith Bank PLC', 'Corporate Resources Network',
    'Account: 1312432840', 'Status: AWAITING PAYMENT',
    'Payment is subject to independent verification before activation.'
  ];
  const esc=s=>String(s).replace(/[^\x20-\x7E]/g,' ').replace(/[\\()]/g,'\\$&');
  let content='BT /F1 12 Tf 52 770 Td 16 TL ';
  lines.forEach((line,index)=>{content+=(index?'T* ':'')+'('+esc(line)+') Tj ';});
  content+='ET';
  const stream=Buffer.from(content,'ascii');
  const objs=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length '+stream.length+' >>\nstream\n'+content+'\nendstream'
  ];
  let result='%PDF-1.4\n', offsets=[0];
  objs.forEach((o,i)=>{offsets.push(Buffer.byteLength(result,'latin1'));result+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
  const at=Buffer.byteLength(result,'latin1');
  result+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+at+'\n%%EOF';
  return Buffer.from(result,'latin1');
}
module.exports={pdfInvoice};
