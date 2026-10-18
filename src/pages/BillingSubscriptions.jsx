import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { apiRequest, getStoredOrganization } from '../services/api';

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

  const section = TABS.find(([route]) => route === location.pathname)?.[1] || 'Pricing Dashboard';
  const current = catalogue?.plans?.[planId];
  const zermattOffer = catalogue?.negotiatedOffer && planId === 'premium' ? catalogue.negotiatedOffer : null;
  const moduleCatalogue = catalogue?.modules;
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
    {moduleCatalogue && <section style={{ ...box, marginBottom:16 }}>
      <h2 style={{ margin:'0 0 10px', fontSize:19 }}>CHRiS HRIS modules by plan</h2>
      <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse', minWidth:760 }}><thead><tr><th style={{ textAlign:'left', padding:7 }}>HRIS main-menu module</th>{PLAN_IDS.map(id=><th key={id} style={{ padding:7, textAlign:'center' }}>{catalogue.plans[id].label}</th>)}</tr></thead><tbody>
        {Object.entries(HRIS_MODULE_LABELS).map(([key,label])=><tr key={key} style={{ borderTop:'1px solid rgba(255,255,255,.08)' }}><td style={{ padding:7 }}>{label}</td>{PLAN_IDS.map(id=><td key={id} style={{ padding:7, textAlign:'center' }}>{moduleCatalogue.hris[key] <= catalogue.plans[id].tier ? 'Yes' : '—'}</td>)}</tr>)}
      </tbody></table></div>
      <p style={{ margin:'12px 0 0', fontSize:13, color:'#C9D7CE' }}>Reporting scope: Basic includes essential payroll and statutory reporting; Standard includes extended operational reporting; Premium includes full advanced Reports &amp; Analytics. The final service schedule will specify accepted module functions and implementation availability.</p>
    </section>}
    {moduleCatalogue && <section style={{ ...box, marginBottom:16 }}>
      <h2 style={{ margin:'0 0 10px', fontSize:19 }}>Employee Self-Service (ESS) modules by plan</h2>
      <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse', minWidth:650 }}><thead><tr><th style={{ textAlign:'left', padding:7 }}>ESS module</th>{PLAN_IDS.map(id=><th key={id} style={{ padding:7, textAlign:'center' }}>{catalogue.plans[id].label}</th>)}</tr></thead><tbody>
        {Object.entries(ESS_MODULE_LABELS).map(([key,label])=><tr key={key} style={{ borderTop:'1px solid rgba(255,255,255,.08)' }}><td style={{ padding:7 }}>{label}</td>{PLAN_IDS.map(id=><td key={id} style={{ padding:7, textAlign:'center' }}>{moduleCatalogue.ess[key] <= catalogue.plans[id].tier ? 'Yes' : '—'}</td>)}</tr>)}
      </tbody></table></div>
      <p style={{ margin:'12px 0 0', fontSize:13, color:'#C9D7CE' }}>ESS is optional and separately billed. Where legally required, the agreement will preserve employee access to statutory information, payroll records and documents irrespective of the selected paid ESS features.</p>
    </section>}
    {preview && <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(310px,1fr))', gap:16, marginBottom:16 }}>
      <PriceTable heading="First year — standard catalogue" quote={preview.quote}/>
      <PriceTable heading="Annual renewal — standard catalogue" quote={preview.renewal}/>
    </div>}
    {zermattOffer && preview?.negotiatedFirstYear && <section style={{ ...box, marginBottom:16, borderColor:'#D4AF37' }}>
      <div style={{ fontSize:11, color:'#E8C969', fontWeight:900, letterSpacing:'.08em' }}>ZERMATT PREMIUM COUNTEROFFER — NOT YET CONTRACTED</div>
      <h2 style={{ margin:'8px 0 10px', fontSize:19 }}>Negotiated concession preview</h2>
      <p style={{ margin:'0 0 10px', lineHeight:1.6 }}>First-year Premium offer: <strong>{displayMoney(preview.negotiatedFirstYear.amountVatInclusive)}</strong> VAT-inclusive for <strong>{preview.negotiatedFirstYear.employeeCount}</strong> employees including ESS. This is a specially negotiated commercial concession.</p>
      <p style={{ margin:'0 0 10px', fontSize:13, color:'#C9D7CE' }}>Zermatt Premium renewal is discounted using Standard plan pricing, with no complimentary-seat concession. The renewal retains Premium plan entitlements, subject to the agreed commercial terms. The 14-day grace period and first-year mid-month payroll remain proposal terms only.</p>
      {preview.negotiatedRenewal && <PriceTable heading="Illustrative Premium renewal at Standard plan pricing" quote={preview.negotiatedRenewal}/>}
      <p style={{ margin:'12px 0 0', fontSize:12, color:'#E8C969' }}>Subject to signed acceptance, independently verified payment and final contract. QuickBooks third-party integration remains separately chargeable.</p>
    </section>}
    {catalogue && <section style={box}>
      <h2 style={{ fontSize:18, margin:'0 0 8px' }}>Subscription and implementation policy</h2>
      <p style={{ margin:'0 0 8px', lineHeight:1.65 }}>100% upfront payment before implementation; licence starts on the independently confirmed payment date and runs for 12 months. Implementation target: one calendar month from payment, subject to client readiness.</p>
      <p style={{ margin:0, lineHeight:1.65, color:'#C9D7CE' }}>Zermatt's revised renewal terms use verified employee-seat counts with prevailing Standard Plan rates while retaining Premium functionality, with no complimentary employee seats. Renewal onboarding is NGN 0 for the existing deployment. The 14-day renewal grace period applies only if accepted in the signed agreement and does not waive renewal fees or alter the subscription anniversary.</p>
    </section>}
  </main>;
}
