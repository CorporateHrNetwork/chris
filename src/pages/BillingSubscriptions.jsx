import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { apiRequest, getStoredOrganization } from '../services/api';
import { jsPDF } from 'jspdf';

const TABS = [
  ['/billing','Pricing Dashboard'],
  ['/billing/current-plan','Current Plan'],
  ['/billing/subscription','Subscription & Renewal'],
  ['/billing/usage','Usage'],
  ['/billing/details','Billing Details'],
  ['/billing/history','Billing History'],
  ['/billing/invoices','Invoices'],
];
const displayMoney = value => '₦' + Number(value || 0).toLocaleString('en-NG');
const HRIS_MODULE_LABELS = {
  dashboard:'Dashboard', support_requests:'My Support Requests', employees:'Employees', recruitment:'Recruitment',
  time_attendance:'Time & Attendance', leave:'Leave', payroll:'Payroll', compensation_rewards:'Compensation & Rewards',
  benefits:'Benefits', statutories:'Statutories', performance:'Performance', training_development:'Training & Development',
  assets:'Assets', documents:'Documents', reports_analytics:'Reports & Analytics', organization:'Organization',
  workflows_approvals:'Workflows & Approvals', employment_types:'Employment Types', settings:'Settings', billing_subscription:'Billing & Subscription'
};
const ESS_MODULE_LABELS = {
  overview:'Overview', my_profile:'My Profile', onboarding:'Onboarding status', statutory:'Statutory',
  payment_payroll:'Payment & Payroll', payslips:'Payslips', leave_attendance:'Leave & Attendance',
  performance_evaluation:'Performance Evaluation', gratuity:'Gratuity', birthdays_anniversaries:'Birthday & Anniversaries',
  internal_communications:'Internal Communications', documents:'Documents'
};
const PLAN_IDS = ['basic','standard','premium'];

const BILLER = {
  name: 'Corporate Resources Network',
  product: 'CHRiS | CorporateHr Network Information System',
  bank: 'Zenith Bank',
  account: '1312432840',
  address: 'Office 10 & 12, Palatable Plaza, Agbara Estate, Lagos',
  phone: '08068120880',
  email: 'chris@crnetwork.com.ng',
  taxId: '2623799142200',
};
const invoiceMoney = value => 'NGN ' + Number(value || 0).toLocaleString('en-NG', { minimumFractionDigits:2, maximumFractionDigits:2 });
async function imageDataUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Unable to load CRNetwork logo');
  const blob = await response.blob();
  const sourceUrl = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve,reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          const ctx = canvas.getContext('2d', { willReadFrequently:true });
          ctx.drawImage(image, 0, 0);
          const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = pixels.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (r >= 242 && g >= 242 && b >= 242) data[i + 3] = 0;
          }
          ctx.putImageData(pixels, 0, 0);
          resolve({ dataUrl: canvas.toDataURL('image/png'), width: image.naturalWidth, height: image.naturalHeight });
        } catch (err) { reject(err); }
      };
      image.onerror = reject;
      image.src = sourceUrl;
    });
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

const lineLabels = [
  ['licence','HRIS licence — 12 months'],
  ['ess','Employee Self-Service — 12 months'],
  ['onboarding','Onboarding — once per employee'],
  ['support','Technical support — annual'],
];
const box = { background:'#071B12', border:'1px solid rgba(212,175,55,.30)', borderRadius:14, padding:18, color:'#f5f8f6' };
const input = { width:'100%', minHeight:40, boxSizing:'border-box', borderRadius:9, border:'1px solid rgba(212,175,55,.45)', background:'#0B2118', color:'#ffffff', padding:'8px 10px', font:'inherit' };

function PriceTable({ heading, quote }) {
  if (!quote) return null;
  return <section style={box} aria-label={heading}>
    <h3 style={{ margin:'0 0 12px', color:'#E8C969' }}>{heading}</h3>
    <table style={{ width:'100%', borderCollapse:'collapse' }}><tbody>
      {lineLabels.map(([key,label])=><tr key={key} style={{ borderBottom:'1px solid rgba(255,255,255,.1)' }}><th scope="row" style={{ textAlign:'left', fontWeight:500, padding:'9px 6px' }}>{label}</th><td style={{ textAlign:'right', padding:'9px 6px', whiteSpace:'nowrap' }}>{displayMoney(quote.lineItems?.[key])}</td></tr>)}
      <tr><th scope="row" style={{ textAlign:'left', padding:'9px 6px' }}>Subtotal</th><td style={{ textAlign:'right', padding:'9px 6px' }}>{displayMoney(quote.subtotal)}</td></tr>
      <tr><th scope="row" style={{ textAlign:'left', padding:'9px 6px' }}>Indicative VAT (7.5%, if applicable)</th><td style={{ textAlign:'right', padding:'9px 6px' }}>{displayMoney(quote.vat)}</td></tr>
      <tr style={{ borderTop:'2px solid #D4AF37' }}><th scope="row" style={{ textAlign:'left', fontSize:17, padding:'12px 6px' }}>Estimated total</th><td style={{ textAlign:'right', fontWeight:900, fontSize:18, padding:'12px 6px', whiteSpace:'nowrap' }}>{displayMoney(quote.total)}</td></tr>
    </tbody></table>
    {quote.billableSeats !== undefined && <p style={{ margin:'10px 0 0', fontSize:13, color:'#B8C9C0' }}>Billable seats: {quote.billableSeats} of {quote.employeeCount}.</p>}
  </section>;
}

export default function BillingSubscriptions() {
  const location = useLocation();
  const initialSlug = getStoredOrganization()?.slug;
  const [catalogue,setCatalogue] = useState(null);
  const [planId,setPlanId] = useState('premium');
  const [employees,setEmployees] = useState(initialSlug === 'zermatt-liquor-limited' ? '320' : '1');
  const [includeEss,setIncludeEss] = useState(true);
  const [preview,setPreview] = useState(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [invoiceEmail,setInvoiceEmail] = useState('');
  const [invoiceBusy,setInvoiceBusy] = useState(false);
  const [invoiceMessage,setInvoiceMessage] = useState('');
  useEffect(() => {
    let cancelled = false;
    apiRequest('/api/billing/catalogue')
      .then(result => { if(!cancelled){setCatalogue(result.data);setLoading(false);} })
      .catch(err => { if(!cancelled){setError(err.message || 'Unable to load pricing catalogue.');setLoading(false);} });
    return () => { cancelled = true; };
  },[]);
  useEffect(() => {
    if(!catalogue) return;
    const count = Number(employees);
    if(!Number.isSafeInteger(count) || count<1 || count>100000) return;
    let cancelled = false;
    apiRequest('/api/billing/quotes', { method:'POST', body:{ planId, employeeCount: count, includeEss } })
      .then(result => { if(!cancelled) setPreview(result.data); })
      .catch(err => { if(!cancelled){setPreview(null);setError(err.message || 'Unable to calculate estimate.');} });
    return () => { cancelled = true; };
  },[catalogue,planId,employees,includeEss]);


  const current = catalogue?.plans?.[planId];
  const zermattOffer = catalogue?.negotiatedOffer && planId === 'premium' ? catalogue.negotiatedOffer : null;
  const invoiceQuote = preview?.negotiatedFirstYear && planId === 'premium' && Number(employees) === 320 && includeEss
    ? { ...preview.negotiatedFirstYear, total: preview.negotiatedFirstYear.amountVatInclusive, subtotal: preview.negotiatedFirstYear.subtotalBeforeVat }
    : preview?.quote;
  const selectedHrisModules = (preview?.quote?.entitlements?.hris || [])
    .map(key => HRIS_MODULE_LABELS[key])
    .filter(Boolean);
  const selectedEssModules = includeEss
    ? (preview?.quote?.entitlements?.ess || []).map(key => ESS_MODULE_LABELS[key]).filter(Boolean)
    : [];
  const invoiceNumber = 'CHRIS-INV-' + new Date().toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
  const buildInvoicePdf = async () => {
    if (!invoiceQuote || !current) throw new Error('Select a valid plan and employee count first.');
    const doc = new jsPDF({ unit:'mm', format:'a4' });
    const logo = await imageDataUrl('/crnetwork-logo.jpeg');
    const left = 18;
    doc.setTextColor(6,78,59);
    doc.setFont('helvetica','bold');
    doc.setFontSize(17);
    doc.text(BILLER.name,left,18);
    doc.setTextColor(154,116,16);
    doc.setFontSize(9);
    doc.text(BILLER.product,left,24);
    doc.setDrawColor(11,107,67);
    doc.setLineWidth(1);
    doc.line(left,28,192,28);
    const maxLogoWidth = 32;
    const maxLogoHeight = 16;
    const logoScale = Math.min(maxLogoWidth / logo.width, maxLogoHeight / logo.height);
    const logoWidth = logo.width * logoScale;
    const logoHeight = logo.height * logoScale;
    doc.addImage(logo.dataUrl,'PNG',192 - logoWidth,10,logoWidth,logoHeight);
    doc.setTextColor(23,33,28);
    doc.setFontSize(9);
    doc.setFont('helvetica','normal');
    doc.text(BILLER.address,left,35);
    doc.text('Phone: ' + BILLER.phone + '   Email: ' + BILLER.email,left,40);
    doc.setFillColor(240,246,242); doc.setDrawColor(11,107,67); doc.setLineWidth(.35);
    doc.roundedRect(left,43,174,14,2,2,'FD');
    doc.setTextColor(6,78,59); doc.setFont('helvetica','bold'); doc.setFontSize(9.5);
    doc.text('PAYMENT ACCOUNT',left+4,48);
    doc.setTextColor(23,33,28); doc.setFontSize(9);
    doc.text(BILLER.bank + '  |  Account: ' + BILLER.account,left+4,53);
    doc.text('Tax ID: ' + BILLER.taxId,left+104,53);
    doc.setFont('helvetica','bold'); doc.setFontSize(20); doc.setTextColor(6,78,59);
    doc.text('INVOICE',left,66);
    doc.setFontSize(9); doc.setTextColor(71,85,105); doc.setFont('helvetica','normal');
    doc.text('Invoice No: ' + invoiceNumber, left,72);
    doc.text('Invoice Date: ' + new Date().toLocaleDateString('en-GB'), left,77);
    doc.text('Plan: ' + current.label + '   Employees: ' + employees + '   ESS: ' + (includeEss ? 'Included' : 'Not selected'), left,82);
    doc.setFont('helvetica','bold'); doc.setTextColor(6,78,59);
    doc.text('BILL TO',left,92);
    doc.setFont('helvetica','normal'); doc.setTextColor(23,33,28);
    doc.text(catalogue?.organizationName || 'Customer',left,98);
    let y=109;
    const rows=[
      ['CHRiS licence — 12 months', invoiceQuote.lineItems?.licence],
      ['Employee Self-Service — 12 months', invoiceQuote.lineItems?.ess],
      ['Onboarding — one-time per employee', invoiceQuote.lineItems?.onboarding],
      ['Technical support — annual', invoiceQuote.lineItems?.support],
    ].filter(([,amount]) => amount !== undefined);
    doc.setFillColor(6,78,59); doc.setTextColor(255,255,255); doc.rect(left,y,174,9,'F');
    doc.setFont('helvetica','bold'); doc.text('DESCRIPTION',left+3,y+6); doc.text('AMOUNT',189,y+6,{align:'right'});
    y+=15; doc.setTextColor(23,33,28); doc.setFont('helvetica','normal');
    rows.forEach(([label,amount])=>{ doc.text(label,left+3,y); doc.text(invoiceMoney(amount),189,y,{align:'right'}); doc.setDrawColor(220,226,222); doc.line(left,y+3,192,y+3); y+=9; });
    y+=4; doc.setFont('helvetica','bold');
    doc.text('Subtotal',left+95,y); doc.text(invoiceMoney(invoiceQuote.subtotal),189,y,{align:'right'}); y+=8;
    doc.text('VAT (7.5%, illustrative)',left+95,y); doc.text(invoiceMoney(invoiceQuote.vat),189,y,{align:'right'}); y+=10;
    doc.setFillColor(232,201,105); doc.setTextColor(7,25,18); doc.rect(left,y-5,174,12,'F');
    doc.text('TOTAL',left+95,y+3); doc.text(invoiceMoney(invoiceQuote.total),189,y+3,{align:'right'});
    y+=22; doc.setTextColor(6,78,59); doc.setFontSize(10); doc.text('CHRiS modules included with selected plan',left,y);
    y+=7; doc.setTextColor(23,33,28); doc.setFontSize(8);
    const moduleLines = [
      ['CHRiS licence', selectedHrisModules],
      ['ESS', includeEss ? selectedEssModules : ['Not selected']],
    ];
    moduleLines.forEach(([heading,items])=>{
      doc.setFont('helvetica','bold'); doc.text(heading + ':',left,y); doc.setFont('helvetica','normal');
      const text=items.join(' · '); const split=doc.splitTextToSize(text,145); doc.text(split,left+28,y); y += Math.max(6,split.length*4.5);
    });
    y+=4; doc.setTextColor(100,116,139); doc.setFontSize(7.5);
    doc.text('Payment account: Corporate Resources Network | Zenith Bank | 1312432840',left,y); y+=4;
    doc.text('Product: ' + BILLER.product,left,y); y+=4;
    doc.text('This invoice reflects the selected plan quotation. Final tax treatment and contractual activation remain subject to the executed subscription terms.',left,y);
    return { doc, invoiceNumber };
  };
  const downloadInvoice = async () => {
    try { setInvoiceBusy(true); setInvoiceMessage(''); const result=await buildInvoicePdf(); result.doc.save(result.invoiceNumber + '.pdf'); setInvoiceMessage('Invoice PDF downloaded.'); }
    catch(err){ setInvoiceMessage(err.message || 'Unable to create invoice PDF.'); }
    finally{ setInvoiceBusy(false); }
  };
  const emailInvoice = async () => {
    try {
      if(!invoiceEmail.trim()) throw new Error('Enter the recipient email address.');
      setInvoiceBusy(true); setInvoiceMessage('');
      const result=await buildInvoicePdf();
      const pdfBase64=result.doc.output('datauristring').split(',')[1];
      const response=await apiRequest('/api/billing/invoice/email',{method:'POST',body:{
        recipientEmail:invoiceEmail.trim(), pdfBase64,
        invoice:{ invoiceNumber:result.invoiceNumber, planLabel:current.label, total:invoiceQuote.total }
      }});
      setInvoiceMessage(response?.data?.status === 'SENT' ? 'Invoice emailed successfully.' : 'Invoice email is pending configuration.');
    } catch(err){ setInvoiceMessage(err.message || 'Unable to email invoice.'); }
    finally{ setInvoiceBusy(false); }
  };

  const section = TABS.find(([route]) => route === location.pathname)?.[1] || 'Pricing Dashboard';
  return <main style={{ color:'var(--chris-text-main, #f5f8f6)', padding:'0 0 26px' }}>
    <header style={{ ...box, background:'linear-gradient(145deg, #0C5433 0%, #051E14 100%)', marginBottom:16 }}>
      <div style={{ color:'#E8C969', letterSpacing:'.12em', fontWeight:800, fontSize:11 }}>CHRiS | PEOPLE · PERFORMANCE · REWARDS</div>
      <h1 style={{ margin:'6px 0', fontSize:27 }}>Billing & Subscription</h1>
      <p style={{ margin:'7px 0', color:'#D1DDD6' }}>Approved three-tier pricing catalogue, plan entitlements and tenant-specific, read-only quotation estimates.</p>
      <p style={{ color:'#FFD88C', margin:'10px 0 0', fontSize:13 }}>Estimates are not invoices. This page does not activate a licence, verify payment or modify the existing subscription.</p>
    </header>
    <nav aria-label="Billing and subscription sections" style={{ display:'flex', gap:8, overflowX:'auto', marginBottom:16, paddingBottom:7 }}>
      {TABS.map(([path,label])=><NavLink key={path} to={path} end style={({isActive})=>({
        whiteSpace:'nowrap', padding:'9px 12px', borderRadius:9, fontSize:12, fontWeight:800, textDecoration:'none',
        color:isActive?'#071911':'#DDEBE3', background:isActive?'#D4AF37':'#173226'
      })}>{label}</NavLink>)}
    </nav>
    <section style={{ ...box, marginBottom:16 }}>
      <h2 style={{ margin:'0 0 7px', fontSize:20 }}>{section}</h2>
      {loading ? <p role="status">Loading approved pricing catalogue…</p> : null}
      {error ? <p role="alert" style={{ color:'#FFB8A6' }}>{error}</p> : null}
      {!loading && catalogue && <p style={{ fontSize:13, margin:'0 0 4px', color:'#B8C9C0' }}>
        Account: {catalogue.organizationName}. Catalogue: {catalogue.version}.
        Current active plan and payment ledger are not yet linked to this module; selected plans below are quotation scenarios only.
      </p>}
      {location.pathname.endsWith('/invoices') || location.pathname.endsWith('/history')
        ? <p style={{ color:'#B8C9C0' }}>Verified invoices and payment history will be displayed here after secure billing-ledger integration. No historical invoices have been assumed or recreated.</p>
        : null}
      {location.pathname.endsWith('/usage') ? <p style={{ color:'#B8C9C0' }}>Enter the authorised billable employee count below. This is an input for estimating fees; it does not read or change employees in the payroll database.</p> : null}
    </section>
    {catalogue && <section style={{ ...box, marginBottom:16 }}>
      <h2 style={{ margin:'0 0 14px', fontSize:19 }}>Calculate Basic, Standard or Premium</h2>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(205px,1fr))', gap:12 }}>
        <label style={{ display:'grid', gap:5 }}>Plan
          <select value={planId} onChange={e=>setPlanId(e.target.value)} style={input}>
            {Object.entries(catalogue.plans).map(([key,p])=><option key={key} value={key}>{p.label}</option>)}
          </select>
        </label>
        <label style={{ display:'grid', gap:5 }}>Employees (quote input only)
          <input type="number" min="1" max="100000" step="1" value={employees} onChange={e=>setEmployees(e.target.value)} style={input}/>
        </label>
        <label style={{ display:'flex', alignItems:'center', gap:9, paddingTop:24 }}>
          <input type="checkbox" checked={includeEss} onChange={e=>setIncludeEss(e.target.checked)}/> Include Employee Self-Service
        </label>
      </div>
      {current && <p style={{ margin:'14px 0 0', color:'#D1DDD6', fontSize:13 }}>
        Rates per employee: licence {displayMoney(current.licenceMonthly)}/month; ESS {displayMoney(current.essMonthly)}/month; onboarding {displayMoney(current.onboardingOnce)} once; support {displayMoney(current.supportAnnual)}/year.
      </p>}
    </section>}
    {preview?.quote?.entitlements && <section style={{ ...box, marginBottom:16, borderColor:'#D4AF37' }}>
      <div style={{ color:'#E8C969', fontSize:11, fontWeight:900, letterSpacing:'.08em' }}>SELECTED PLAN MODULES</div>
      <h2 style={{ margin:'7px 0 10px', fontSize:19 }}>{current?.label} plan modules</h2>
      <p style={{ margin:'0 0 14px', color:'#C9D7CE', fontSize:13, lineHeight:1.55 }}>
        Selecting a plan automatically updates the module entitlements below. These are the modules mapped to the selected plan; they are not a separate licence activation.
      </p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:12 }}>
        <div style={{ padding:14, border:'1px solid rgba(212,175,55,.25)', borderRadius:10 }}>
          <strong style={{ color:'#E8C969' }}>CHRiS modules</strong>
          <ul style={{ margin:'10px 0 0', paddingLeft:20 }}>
            {selectedHrisModules.map(module => <li key={module} style={{ marginBottom:6 }}>{module}</li>)}
          </ul>
        </div>
        <div style={{ padding:14, border:'1px solid rgba(212,175,55,.25)', borderRadius:10 }}>
          <strong style={{ color:'#E8C969' }}>Employee Self-Service (ESS)</strong>
          {includeEss
            ? <ul style={{ margin:'10px 0 0', paddingLeft:20 }}>{selectedEssModules.map(module => <li key={module} style={{ marginBottom:6 }}>{module}</li>)}</ul>
            : <p style={{ margin:'10px 0 0', color:'#9FB2A8' }}>ESS is not selected. Enable “Include Employee Self-Service” to show the ESS modules mapped to this plan.</p>}
        </div>
      </div>
      <p style={{ margin:'14px 0 0', fontSize:13, color:'#C9D7CE' }}>
        Reporting scope: Basic includes essential payroll and statutory reporting; Standard includes extended operational reporting; Premium includes full advanced Reports &amp; Analytics.
      </p>
      <p style={{ margin:'8px 0 0', fontSize:12, color:'#9FB2A8' }}>
        ESS is optional and separately billed. Where legally required, the agreement preserves employee access to statutory information, payroll records and documents irrespective of selected paid ESS features.
      </p>
    </section>}
    {preview && <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(310px,1fr))', gap:16, marginBottom:16 }}>
      <PriceTable heading="First year - standard catalogue" quote={preview.quote}/>
      <PriceTable heading="Annual renewal - standard catalogue" quote={preview.renewal}/>
    </div>}
    {zermattOffer && preview?.negotiatedFirstYear && <section style={{ ...box, marginBottom:16, borderColor:'#D4AF37' }}>
      <div style={{ fontSize:11, color:'#E8C969', fontWeight:900, letterSpacing:'.08em' }}>ZERMATT PREMIUM COUNTEROFFER — NOT YET CONTRACTED</div>
      <h2 style={{ margin:'8px 0 10px', fontSize:19 }}>Negotiated concession preview</h2>
      <p style={{ margin:'0 0 10px', lineHeight:1.6 }}>First-year Premium offer: <strong>{displayMoney(preview.negotiatedFirstYear.amountVatInclusive)}</strong> VAT-inclusive for <strong>{preview.negotiatedFirstYear.employeeCount}</strong> employees including ESS. This is a specially negotiated commercial concession.</p>
      <p style={{ margin:'0 0 10px', fontSize:13, color:'#C9D7CE' }}>Zermatt Premium renewal is discounted using Standard plan pricing, with no complimentary-seat concession. The renewal retains Premium plan entitlements, subject to the agreed commercial terms. The 14-day grace period and first-year mid-month payroll remain proposal terms only.</p>
      {preview.negotiatedRenewal && <PriceTable heading="Illustrative Premium renewal at Standard plan pricing" quote={preview.negotiatedRenewal}/>}
      <p style={{ margin:'12px 0 0', fontSize:12, color:'#E8C969' }}>Subject to signed acceptance, independently verified payment and final contract. QuickBooks third-party integration remains separately chargeable.</p>
    </section>}

    {catalogue && invoiceQuote && <section style={{ ...box, marginTop:16, borderColor:'#D4AF37' }}>
      <div style={{ color:'#E8C969', fontSize:11, fontWeight:900, letterSpacing:'.08em' }}>CHRiS INVOICE</div>
      <h2 style={{ margin:'7px 0 8px', fontSize:20 }}>Invoice for selected plan</h2>
      <p style={{ margin:'0 0 12px', color:'#C9D7CE', lineHeight:1.55 }}>Biller: <strong>Corporate Resources Network</strong> · Product: <strong>CHRiS | CorporateHr Network Information System</strong>.</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:12 }}>
        <div style={{ padding:12, border:'1px solid rgba(212,175,55,.25)', borderRadius:10 }}>
          <strong style={{ color:'#E8C969' }}>CHRiS licence modules — {current?.label}</strong>
          <ul style={{ margin:'8px 0 0', paddingLeft:18 }}>{selectedHrisModules.map(m=><li key={m} style={{ marginBottom:4 }}>{m}</li>)}</ul>
        </div>
        <div style={{ padding:12, border:'1px solid rgba(212,175,55,.25)', borderRadius:10 }}>
          <strong style={{ color:'#E8C969' }}>ESS modules — {includeEss ? current?.label : 'Not selected'}</strong>
          <ul style={{ margin:'8px 0 0', paddingLeft:18 }}>{(includeEss ? selectedEssModules : ['ESS not selected']).map(m=><li key={m} style={{ marginBottom:4 }}>{m}</li>)}</ul>
        </div>
      </div>
      <div style={{ marginTop:14, display:'grid', gridTemplateColumns:'minmax(220px,1fr) auto auto', gap:10, alignItems:'end' }}>
        <label style={{ display:'grid', gap:5 }}>Recipient email for invoice
          <input type="email" value={invoiceEmail} onChange={e=>setInvoiceEmail(e.target.value)} placeholder="customer@example.com" style={input}/>
        </label>
        <button type="button" onClick={downloadInvoice} disabled={invoiceBusy} style={{ minHeight:40, padding:'8px 14px', border:0, borderRadius:9, background:'#D4AF37', color:'#071911', fontWeight:900, cursor:invoiceBusy?'wait':'pointer' }}>{invoiceBusy ? 'Processing…' : 'Download PDF'}</button>
        <button type="button" onClick={emailInvoice} disabled={invoiceBusy} style={{ minHeight:40, padding:'8px 14px', border:'1px solid #D4AF37', borderRadius:9, background:'#173226', color:'#F5F8F6', fontWeight:900, cursor:invoiceBusy?'wait':'pointer' }}>Email Invoice</button>
      </div>
      {invoiceMessage && <p role="status" style={{ margin:'10px 0 0', color:'#E8C969' }}>{invoiceMessage}</p>}
      <p style={{ margin:'10px 0 0', fontSize:12, color:'#9FB2A8' }}>Payment: Corporate Resources Network | Zenith Bank | 1312432840. Address: Office 10 & 12, Palatable Plaza, Agbara Estate, Lagos. Phone: 08068120880. Email: chris@crnetwork.com.ng.</p>
    </section>}
    {catalogue && <section style={box}>
      <h2 style={{ fontSize:18, margin:'0 0 8px' }}>Subscription and implementation policy</h2>
      <p style={{ margin:'0 0 8px', lineHeight:1.65 }}>100% upfront payment before implementation; licence starts on the independently confirmed payment date and runs for 12 months. Implementation target: one calendar month from payment, subject to client readiness.</p>
      <p style={{ margin:0, lineHeight:1.65, color:'#C9D7CE' }}>Zermatt's revised renewal terms use verified employee-seat counts with prevailing Standard Plan rates while retaining Premium functionality, with no complimentary employee seats. Renewal onboarding is NGN 0 for the existing deployment. The 14-day renewal grace period applies only if accepted in the signed agreement and does not waive renewal fees or alter the subscription anniversary.</p>
    </section>}
  </main>;
}
