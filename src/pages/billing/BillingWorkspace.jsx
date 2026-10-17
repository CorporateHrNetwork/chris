import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiRequest } from "../../services/api";
const links = [["/billing","Overview"],["/billing/current-plan","Current Plan"],["/billing/subscription","Subscription"],["/billing/usage","Usage"],["/billing/details","Billing Details"],["/billing/history","History"],["/billing/invoices","Invoices"]];
const money = (minor, currency="NGN") => minor == null ? "—" : new Intl.NumberFormat("en-NG",{style:"currency",currency}).format(Number(minor)/100);
export default function BillingWorkspace(){
 const {pathname}=useLocation(), section=pathname.split("/")[2]||"overview";
 const [catalogue,setCatalogue]=useState(null),[records,setRecords]=useState(null),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;Promise.allSettled([apiRequest("/api/billing/catalogue"),apiRequest("/api/billing/records")]).then(([a,b])=>{if(!active)return;if(a.status==="fulfilled")setCatalogue(a.value.data);else setError(a.reason?.message||"Catalogue unavailable");if(b.status==="fulfilled")setRecords(b.value.data);else setError(e=>[e,b.reason?.message||"Billing records unavailable"].filter(Boolean).join(" · "));}).finally(()=>{if(active)setLoading(false)});return()=>{active=false};},[]);
 const subscriptions=records?.subscriptions||[],invoices=records?.invoices||[],payments=records?.payments||[],latest=subscriptions[0];
 const panel={padding:20,marginTop:20,borderRadius:12,border:"1px solid var(--chris-border-gold, #6b5b35)",background:"var(--chris-bg-card, #10261c)"};
 return <div style={{color:"var(--chris-text-main, #fff)"}}>
  <h1>Billing & Subscription</h1><p>Read-only information. Commercial proposals are not active subscriptions or payable invoices.</p>
  <nav aria-label="Billing sections" style={{display:"flex",flexWrap:"wrap",gap:14}}>{links.map(([url,title])=><Link key={url} to={url} aria-current={pathname===url?"page":undefined} style={{color:"var(--chris-gold, #d4af37)"}}>{title}</Link>)}</nav>
  {loading&&<p role="status">Loading billing information…</p>}{error&&<p role="alert">{error}</p>}
  {!loading&&<section style={panel}>
   {["overview","current-plan","subscription"].includes(section)&&<><h2>Subscription Status</h2>{latest?<p>{latest.planCode} · {latest.status} · {latest.contractedSeats} contracted seats · {latest.complimentarySeats} complimentary seats · {money(latest.annualAmountMinor,latest.currency)} annual amount</p>:<p>{records ? "No subscription record exists for this organization." : "Billing records unavailable; subscription status is unknown."}</p>}{catalogue?.negotiatedOffer&&<p>Negotiated offer: reference only, not activated.</p>}</>}
   {section==="usage"&&<><h2>Licensed Seats</h2><p>{latest?String(latest.contractedSeats)+" contracted seats and "+String(latest.complimentarySeats)+" complimentary seats.":"Seat entitlement unavailable."} Actual employee usage is not connected.</p></>}
   {section==="details"&&<><h2>Billing Details</h2><p>Billing identity and payment instructions are not connected. No payment action is available.</p></>}
   {["overview","history","invoices"].includes(section)&&<><h2>Invoices</h2>{invoices.length?<ul>{invoices.map(i=><li key={i.id}>{i.invoiceNumber} · {i.status} · {money(i.totalMinor,i.currency)}</li>)}</ul>:<p>{records ? "No invoices recorded." : "Billing records unavailable; invoice status is unknown."}</p>}{section!=="invoices"&&<><h3>Payments</h3>{payments.length?<ul>{payments.map(p=><li key={p.id}>{p.status} · {money(p.amountMinor,p.currency)}</li>)}</ul>:<p>{records ? "No payments recorded." : "Billing records unavailable; payment status is unknown."}</p>}</>}</>}
  </section>}
 </div>;
}
