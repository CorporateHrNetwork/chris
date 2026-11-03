import { jsPDF } from "jspdf";
const IDS=["basic","standard","premium"];
const fmt=n=>"NGN "+Number(n||0).toLocaleString("en-NG");
const rowsForRates=[
 ["CHRiS licence / employee / month","licenceMonthly"],
 ["ESS / employee / month (optional)","essMonthly"],
 ["Onboarding / employee / month (first 12 months)","onboardingMonthly"],
 ["Annual support / employee / month","supportMonthly"]
];
export async function downloadDemoBillingProposalPdf({catalogue,quotes,employees,renewalSeats,includeEss}){
 if(!catalogue||!IDS.every(id=>quotes[id]?.quote&&quotes[id]?.renewal))throw Error("Quotation is not ready");
 const doc=new jsPDF({orientation:"portrait",unit:"mm",format:"a4",compress:true});
 const pageW=210, pageH=297, left=14,right=14,usable=pageW-left-right, bottom=277;
 let y=16;
 const page=()=>{doc.addPage();y=16;};
 const space=(h=7)=>{if(y+h>bottom)page();};
 const line=(value,{bold=false,size=9,color=[27,45,32],gap=5}={})=>{
  doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);doc.setTextColor(...color);
  const lines=doc.splitTextToSize(String(value),usable);
  const h=Math.max(gap,lines.length*(size*.40)+1);
  space(h);doc.text(lines,left,y);y+=h;
 };
 const section=title=>{space(14);y+=3;line(title,{bold:true,size:12,color:[6,78,50],gap:8});};
 const table=(headers,rows,widths)=>{
  const total=widths.reduce((a,b)=>a+b,0),actual=widths.map(v=>v/total*usable);
  const row=(cells,header=false)=>{
   const textLines=cells.map((value,i)=>doc.splitTextToSize(String(value??""),actual[i]-4));
   const height=Math.max(8,...textLines.map(lines=>lines.length*3.7+4));
   space(height+1);
   let x=left;
   for(let i=0;i<cells.length;i++){
    doc.setFillColor(...(header?[230,240,232]:[255,255,255]));
    doc.setDrawColor(191,206,193);doc.rect(x,y-4,actual[i],height,"FD");
    doc.setFont("helvetica",header?"bold":"normal");doc.setFontSize(8);
    doc.setTextColor(24,42,31);doc.text(textLines[i],x+2,y);
    x+=actual[i];
   }
   y+=height;
  };
  row(headers,true);
  for(const r of rows){if(y+14>bottom){page();row(headers,true);}row(r);}
  y+=4;
 };
 doc.setFillColor(6,78,50);doc.rect(0,0,pageW,7,"F");
 line("CORPORATE RESOURCES NETWORK  |  CHRiS",{bold:true,size:10,color:[6,78,50],gap:8});
 line("Billing & Subscription - Pricing Proposal",{bold:true,size:17,color:[6,78,50],gap:10});
 line("Prepared for: "+(catalogue.organizationName||"Fictional demo organisation"),{size:9});
 line("Initial seats: "+employees+"    Renewal estimate seats: "+renewalSeats+"    MY CHRiS ESS: "+(includeEss?"Included":"Not included"));
 line("DEMO ONLY - Non-binding proposal; no payment or subscription activation.",{bold:true,size:8,color:[140,99,28],gap:7});
 section("Plan profiles and monthly rates");
 table(["Pricing component",...IDS.map(id=>catalogue.plans[id].label)],[
  ["Plan profile",...IDS.map(id=>catalogue.plans[id].profile)],
  ...rowsForRates.map(([label,key])=>[label,...IDS.map(id=>fmt(catalogue.plans[id][key]))])
 ],[43,19,19,19]);
 section("First-year proposal and renewal estimates");
 table(["Annual amount",...IDS.map(id=>catalogue.plans[id].label)],[
  ...["licence","ess","onboarding","support"].map(key=>[key.toUpperCase()+" - first year",...IDS.map(id=>fmt(quotes[id].quote.lineItems[key]))]),
  ["Illustrative first-year VAT (7.5%)",...IDS.map(id=>fmt(quotes[id].quote.vat))],
  ["FIRST-YEAR TOTAL",...IDS.map(id=>fmt(quotes[id].quote.total))],
  ["Renewal subtotal (no onboarding)",...IDS.map(id=>fmt(quotes[id].renewal.subtotal))],
  ["Illustrative renewal VAT (7.5%)",...IDS.map(id=>fmt(quotes[id].renewal.vat))],
  ["RENEWAL ESTIMATE AT CURRENT RATES",...IDS.map(id=>fmt(quotes[id].renewal.total))]
 ],[43,19,19,19]);
 line("Onboarding is charged for the first 12 months only. Actual renewal is priced at the approved rates effective in the renewal year and actual billable seats at that time. Figures above use current demo rates; future rates are not guaranteed. VAT is illustrative.",{size:8,gap:10});
 section("Complete module entitlement comparison");
 for(const [title,key] of [["CHRiS main menu","hris"],["MY CHRiS employee self-service","ess"]]){
  line(title,{bold:true,size:10,color:[6,78,50],gap:8});
  table(["Module",...IDS.map(id=>catalogue.plans[id].label)],Object.entries(catalogue.modules[key]||{}).map(([code,label])=>[
   label,...IDS.map(id=>key==="ess"&&!includeEss?"Optional ESS":quotes[id].quote.entitlements[key].includes(code)?"Included":"Not included")
  ]),[43,19,19,19]);
 }
 section("Reports & Analytics scope");
 table(["Plan","Reporting scope"],IDS.map(id=>[catalogue.plans[id].label,catalogue.modules.reportingScope[id]]),[24,76]);
 line("All prices are indicative, subject to approved commercial terms and final invoice review.",{size:8});
 const count=doc.getNumberOfPages();
 for(let i=1;i<=count;i++){
  doc.setPage(i);doc.setDrawColor(180,198,183);doc.line(left,284,pageW-right,284);
  doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(70,95,77);
  doc.text("Corporate Resources Network | CHRiS sales demo | Non-binding pricing illustration",left,289);
  doc.text(i+" / "+count,pageW-right,289,{align:"right"});
 }
 doc.save("CHRiS-Demo-Billing-Subscription-Pricing-Proposal.pdf");
}
