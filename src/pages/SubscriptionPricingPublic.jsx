import { useMemo, useState } from 'react';
import { API_BASE_URL } from '../services/api';
const plans={basic:{name:'Basic',lic:1200,ess:700,on:500,sup:700},standard:{name:'Standard',lic:1500,ess:800,on:500,sup:800},premium:{name:'Premium',lic:1700,ess:900,on:500,sup:900}};
const fmt=n=>'₦'+n.toLocaleString('en-NG');
const moduleMap={basic:['Overview','My Profile','Onboarding','Statutory','Payment & Payroll','Payslips','Documents'],standard:['Overview','My Profile','Onboarding','Statutory','Payment & Payroll','Payslips','Documents','Leave & Attendance','Birthday & Anniversaries','Internal Communications'],premium:['Overview','My Profile','Onboarding','Statutory','Payment & Payroll','Payslips','Documents','Leave & Attendance','Birthday & Anniversaries','Internal Communications','Performance Evaluation','Gratuity']};
export default function SubscriptionPricingPublic(){
 const [planId,setPlan]=useState('standard'),[employees,setEmployees]=useState(320),[ess,setEss]=useState(true),[companyName,setCompany]=useState(''),[billingEmail,setEmail]=useState(''),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[result,setResult]=useState(null);
 const p=plans[planId],n=Number(employees);
 const quote=useMemo(()=>{const c=Number.isSafeInteger(n)&&n>0?n:0;const licence=c*p.lic*12,employeeEss=ess?c*p.ess*12:0,onboarding=c*p.on,support=c*p.sup;const subtotal=licence+employeeEss+onboarding+support;return {licence,ess:employeeEss,onboarding,support,subtotal,vat:Math.round(subtotal*.075),total:subtotal+Math.round(subtotal*.075)}},[n,p,ess]);
 async function submit(e){e.preventDefault();setBusy(true);setResult(null);try{const r=await fetch(API_BASE_URL+'/api/commercial/subscriptions/invoice-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({planId,employeeCount:n,includeEss:ess,companyName,billingEmail,consent})});const j=await r.json();if(!r.ok)throw Error(j.error||j.message||'Unable to request invoice');setResult({ok:true,message:'Invoice request recorded: '+j.invoiceNumber+'. Delivery status: '+j.emailStatus+'. Amount: '+fmt(j.total)});}catch(error){setResult({ok:false,message:error.message})}finally{setBusy(false)}}
 return <main style={{maxWidth:820,margin:'40px auto',padding:24,fontFamily:'system-ui, sans-serif',color:'#1F2937',background:'#fff'}}>
 <header style={{borderBottom:'4px solid #C89B2C',paddingBottom:15}}><strong style={{color:'#0B6B3A'}}>CORPORATE RESOURCES NETWORK</strong><h1>CHRiS Subscription Plans</h1><p>People | Performance | Rewards</p></header>
 <p>Choose a plan, review included ESS features, and request a PDF pro forma invoice by email. Licence and ESS are billed for 12 months; onboarding is ₦500 once per employee across all plans and technical support is annual per employee. Full payment is required before implementation, which is targeted for completion within one calendar month from payment confirmation (subject to client readiness). The 12-month licence term begins on the confirmed payment date; there is no complimentary grace period.</p>
 <form onSubmit={submit}>
 <fieldset><legend>Choose plan</legend>{Object.entries(plans).map(([id,x])=><label key={id} style={{display:'inline-block',padding:12,border:'1px solid #ddd',margin:5,borderRadius:8}}><input type="radio" name="plan" checked={planId===id} onChange={()=>setPlan(id)}/> <b>{x.name}</b><div>{fmt(x.lic)} licence / employee / month</div></label>)}</fieldset>
 <p><label>Active employees <input required min="1" max="100000" type="number" value={employees} onChange={e=>setEmployees(e.target.value)} /></label></p>
 <p><label><input type="checkbox" checked={ess} onChange={e=>setEss(e.target.checked)}/> Include ESS ({fmt(p.ess)} per employee/month)</label></p>
 <h2>ESS modules ({planId})</h2><p>{ess?moduleMap[planId].join(' · '):'Employee Self-Service not selected'}</p>
 <table style={{width:'100%',borderCollapse:'collapse'}}><tbody>{[['Annual licence',quote.licence],['Annual ESS',quote.ess],['One-time onboarding',quote.onboarding],['Annual technical support',quote.support],['Subtotal',quote.subtotal],['Indicative VAT (7.5%)',quote.vat],['First-year total',quote.total]].map(([name,value])=><tr key={name} style={{borderBottom:'1px solid #ddd'}}><td style={{padding:8}}>{name}</td><td style={{textAlign:'right'}}>{fmt(value)}</td></tr>)}</tbody></table>
 <p><label>Registered company name <input required maxLength="160" value={companyName} onChange={e=>setCompany(e.target.value)} /></label></p>
 <p><label>Billing email <input required type="email" value={billingEmail} onChange={e=>setEmail(e.target.value)} /></label></p>
 <p><label><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/> I am authorised to request this quotation and agree to receive invoice emails. No subscription activates automatically.</label></p>
 <button disabled={busy||!Number.isSafeInteger(n)||n<1} style={{background:'#0B6B3A',color:'white',padding:'12px 20px',border:0,borderRadius:5}}>{busy?'Submitting…':'Request PDF invoice'}</button>
 </form>
 {result&&<p role="status" style={{padding:12,background:result.ok?'#eaf7ef':'#fee'}}>{result.message}</p>}
 <footer style={{marginTop:40,fontSize:12}}>All amounts in NGN. Final VAT treatment and terms are subject to issuer review. This request does not prove payment.</footer>
 </main>;
}
