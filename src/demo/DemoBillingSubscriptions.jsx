import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import DemoBillingPrint from "./DemoBillingPrint";
import "./demoBillingPrint.css";
import { apiRequest, getStoredOrganization } from "../services/api";
const IDS = ["basic", "standard", "premium"];
const money = n => "₦" + Number(n || 0).toLocaleString("en-NG");
const panel = { background:"linear-gradient(145deg,#0b3020,#061b12)",color:"#F7FAF8",border:"1px solid rgba(212,175,55,.38)",borderRadius:14,padding:18 };
const muted = {color:"#C9D9CE",fontSize:13};
const th = {textAlign:"left",padding:"10px 12px",color:"#F2CF57",borderBottom:"1px solid #55735F"};
const td = {padding:"9px 12px",borderBottom:"1px solid #315341",fontSize:13};
const currencyRates = [
 ["CHRiS licence / employee / month","licenceMonthly"],
 ["ESS / employee / month (optional)","essMonthly"],
 ["Onboarding / employee / month (first 12 months)","onboardingMonthly"],
 ["Annual support / employee / month","supportMonthly"]
];
export default function DemoBillingSubscriptions(){
 const slug=getStoredOrganization()?.slug;
 const [employees,setEmployees]=useState(slug==="chris-demo-company"?"48":"10");
 const [renewalSeats,setRenewalSeats]=useState(null);
 const [includeEss,setIncludeEss]=useState(true);
 const [catalogue,setCatalogue]=useState(null);
 const [quotes,setQuotes]=useState({});
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [pdfSaving,setPdfSaving]=useState(false);
 const [exportError,setExportError]=useState("");
 useEffect(()=>{
  let active=true;
  apiRequest("/api/billing/catalogue").then(r=>{if(active)setCatalogue(r.data);})
   .catch(e=>{if(active)setError(e.message||"Pricing catalogue unavailable");})
   .finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[]);
 useEffect(()=>{
  const count=Number(employees);
  const renewalCount=Number(renewalSeats===null?employees:renewalSeats);
  if(!catalogue||!Number.isSafeInteger(count)||count<1||count>100000||!Number.isSafeInteger(renewalCount)||renewalCount<1||renewalCount>100000){setQuotes({});return;}
  let active=true;setLoading(true);setError("");
  Promise.all(IDS.map(planId=>apiRequest("/api/billing/quotes",{method:"POST",body:{planId,employeeCount:count,renewalEmployeeCount:renewalCount,includeEss}}).then(r=>[planId,r.data])))
   .then(entries=>{if(active)setQuotes(Object.fromEntries(entries));})
   .catch(e=>{if(active){setQuotes({});setError(e.message||"Quote calculation failed");}})
   .finally(()=>{if(active)setLoading(false);});
  return ()=>{active=false;};
 },[catalogue,employees,renewalSeats,includeEss]);
 const moduleGroups=[["CHRiS main menu","hris"],["MY CHRiS employee self-service","ess"]];
 const ready=!!catalogue&&!loading&&IDS.every(id=>quotes[id]?.quote&&quotes[id]?.renewal);
 const proposal={catalogue,quotes,employees:Number(employees),renewalSeats:Number(renewalSeats===null?employees:renewalSeats),includeEss};
 const printProposal=()=>{if(ready)window.print();};
 const downloadPdf=async()=>{
  if(!ready||pdfSaving)return;
  setPdfSaving(true);setExportError("");
  try {const {downloadDemoBillingProposalPdf}=await import("./demoBillingProposalPdf");await downloadDemoBillingProposalPdf(proposal);}
  catch(e){setExportError("Unable to generate the PDF proposal. Please retry or use Print pricing proposal.");console.error("[demo-billing-pdf]",e);}
  finally{setPdfSaving(false);}
 };
 return <><main className="chris-page" style={{color:"#F7FAF8",maxWidth:1440,margin:"0 auto",paddingBottom:36}}>
  <header style={{...panel,background:"linear-gradient(125deg,#0b5634,#051c13)",marginBottom:16}}>
   <div style={{color:"#F2CF57",fontWeight:900,letterSpacing:".12em",fontSize:12}}>CORPORATEHR NETWORK INFORMATION SYSTEM · CHRiS</div>
   <h1 style={{margin:"8px 0",color:"#FFFFFF"}}>Billing & Subscription — Pricing Proposal</h1>
   <p style={muted}>Three-plan commercial profile and module comparison for {catalogue?.organizationName||"the fictional Northstar demo"}.</p>
   <p style={{color:"#F2CF57",fontSize:12}}>Draft, non-binding demo proposal. No payment, invoice delivery, subscription activation or customer entitlement changes.</p>
  </header>
  <section style={{...panel,marginBottom:16}}>
   <h2 style={{fontSize:18,margin:"0 0 12px"}}>Employee seats & quotation</h2>
   <div style={{display:"flex",gap:22,alignItems:"end",flexWrap:"wrap"}}>
    <label style={{display:"grid",gap:6,fontWeight:700}}>Employee seats No.
     <input aria-label="Employee seats No." type="number" min="1" max="100000" step="1" value={employees} onChange={e=>setEmployees(e.target.value)} style={{background:"#0b291c",color:"#FFFFFF",border:"1px solid #D4AF37",borderRadius:8,padding:10,width:190}}/>
    </label>
    <label style={{display:"grid",gap:6,fontWeight:700}}>Renewal employee seats No.
     <input aria-label="Renewal employee seats No." type="number" min="1" max="100000" step="1" value={renewalSeats===null?employees:renewalSeats} onChange={e=>setRenewalSeats(e.target.value)} style={{background:"#0b291c",color:"#FFFFFF",border:"1px solid #D4AF37",borderRadius:8,padding:10,width:190}}/>
    </label>
    <label style={{display:"flex",alignItems:"center",gap:9,fontWeight:700,minHeight:40}}>
     <input type="checkbox" checked={includeEss} onChange={e=>setIncludeEss(e.target.checked)}/> Include MY CHRiS (ESS)
    </label>
    <button type="button" onClick={printProposal} disabled={!ready} style={{background:"#D4AF37",color:"#082016",border:0,borderRadius:8,padding:"11px 18px",fontWeight:800,cursor:ready?"pointer":"not-allowed",opacity:ready?1:.6}}>Print pricing proposal</button>
    <button type="button" onClick={downloadPdf} disabled={!ready||pdfSaving} style={{background:"#E6F4E9",color:"#082016",border:"1px solid #D4AF37",borderRadius:8,padding:"11px 18px",fontWeight:800,cursor:ready?"pointer":"not-allowed",opacity:ready?1:.6}}>{pdfSaving?"Preparing PDF…":"Download PDF"}</button>
   </div>
   <p style={muted}>Onboarding is charged during the first 12 months only. Renewal excludes onboarding and uses the actual renewal-year seat count and approved prices effective in that year. Estimates shown now use today\u0027s demo catalogue rates; future rates are not guaranteed. Annual support is priced per employee per month. VAT is illustrative at 7.5%.</p>
  </section>
  {loading&&<p role="status">Calculating plan proposals…</p>}
  {error&&<p role="alert" style={{color:"#FFC1B7"}}>{error}</p>}
  {exportError&&<p role="alert" style={{color:"#FFC1B7"}}>{exportError}</p>}
  {catalogue&&<section style={{...panel,marginBottom:16,overflowX:"auto"}}>
   <h2 style={{fontSize:18,marginTop:0}}>Plan profiles & unit rates</h2>
   <table style={{borderCollapse:"collapse",width:"100%",minWidth:650}}>
    <thead><tr><th style={th}>Pricing component</th>{IDS.map(id=><th key={id} style={th}>{catalogue.plans[id]?.label}</th>)}</tr></thead>
    <tbody>
     <tr><td style={td}>Plan profile</td>{IDS.map(id=><td key={id} style={{...td,maxWidth:210}}>{catalogue.plans[id]?.profile}</td>)}</tr>
     {currencyRates.map(([label,key])=><tr key={key}><td style={td}>{label}</td>{IDS.map(id=><td key={id} style={td}>{money(catalogue.plans[id]?.[key])}</td>)}</tr>)}
     <tr><td style={td}><strong>Monthly equivalent per seat {includeEss?"with ESS":"without ESS"}</strong></td>{IDS.map(id=>{const p=catalogue.plans[id];return <td key={id} style={td}><strong>{money(p.licenceMonthly+p.onboardingMonthly+p.supportMonthly+(includeEss?p.essMonthly:0))}</strong></td>})}</tr>
    </tbody>
   </table>
  </section>}
  {catalogue&&<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(255px,1fr))",gap:14,marginBottom:16}}>
   {IDS.map(id=>{const p=catalogue.plans[id],q=quotes[id]?.quote,r=quotes[id]?.renewal;return <section key={id} style={panel}>
    <h2 style={{color:"#F2CF57",margin:"0 0 8px"}}>{p.label}</h2><p style={muted}>{p.profile}</p>
    <div style={{fontSize:26,fontWeight:900,margin:"16px 0 4px"}}>{q?money(q.total):"—"}</div>
    <p style={muted}>First-year proposal including indicative VAT</p>
    <div style={{borderTop:"1px solid #45674D",paddingTop:12,fontSize:13,lineHeight:1.9}}>
     <div>Licence (12 months): {q?money(q.lineItems.licence):"—"}</div>
     <div>ESS (12 months): {q?money(q.lineItems.ess):"—"}</div>
     <div>Onboarding (12 months): {q?money(q.lineItems.onboarding):"—"}</div>
     <div>Annual support (12 months): {q?money(q.lineItems.support):"—"}</div>
     <div>VAT (illustrative): {q?money(q.vat):"—"}</div>
     <strong>Renewal estimate at current rates ({r?.employeeCount??"—"} seats): {r?money(r.total):"—"}</strong>
     <div style={{...muted,fontSize:11}}>Future renewal is repriced using the approved rates effective in the renewal year; this is not a locked renewal price.</div>
    </div>
   </section>})}
  </div>}
  {catalogue&&<section style={{...panel,overflowX:"auto"}}>
   <h2 style={{fontSize:18,marginTop:0}}>Complete module entitlement matrix</h2>
   <p style={muted}>A checkmark means included in the plan comparison. MY CHRiS features require the optional ESS subscription. Reporting scope increases by plan.</p>
   {moduleGroups.map(([heading,key])=><div key={key}>
    <h3 style={{color:"#F2CF57",fontSize:16,margin:"20px 0 8px"}}>{heading}</h3>
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:620}}>
     <thead><tr><th style={th}>Module</th>{IDS.map(id=><th key={id} style={th}>{catalogue.plans[id]?.label}</th>)}</tr></thead>
     <tbody>{Object.entries(catalogue.modules?.[key]||{}).map(([module,label])=><tr key={module}>
      <td style={td}>{label}</td>{IDS.map(id=>{
       const enabled=quotes[id]?.quote?.entitlements?.[key]?.includes(module);
       return <td key={id} style={{...td,color:enabled?"#A9E7B8":"#A8B7AC",fontWeight:enabled?800:400}}>{key==="ess"&&!includeEss?"Optional ESS":enabled?"✓ Included":"—"}</td>;
      })}
     </tr>)}</tbody>
    </table>
   </div>)}
   <h3 style={{color:"#F2CF57",margin:"20px 0 8px"}}>Reports & Analytics depth</h3>
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
    {IDS.map(id=><p key={id} style={muted}><strong style={{color:"#F2CF57"}}>{catalogue.plans[id]?.label}:</strong> {catalogue.modules?.reportingScope?.[id]}</p>)}
   </div>
   <p style={{...muted,borderTop:"1px solid #45674D",paddingTop:12}}>All prices are indicative and subject to approved commercial terms. The demo comparison does not grant or revoke module permissions. Support Requests, Settings and Billing & Subscription remain available for account administration.</p>
  </section>}
 </main>{ready&&createPortal(<div id="chris-demo-billing-print-root"><DemoBillingPrint {...proposal}/></div>,document.body)}</>;
}
