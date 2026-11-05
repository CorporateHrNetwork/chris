import {useEffect,useState} from "react";
import {apiRequest,getStoredOrganization} from "../../services/api";
import {leaveTodayKey} from "../leave/leaveSelectors";
function LeaveCalendar() {
  const [rows,setRows]=useState(null),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const load=()=>apiRequest("/api/leave/requests").then(result=>{
      if(!Array.isArray(result.data))throw new Error("Unable to load leave calendar.");
      const today=leaveTodayKey(new Date(),getStoredOrganization()?.timezone||"Africa/Lagos");
      const visible=result.data.filter(row=>!row.cancelledAt&&!row.returnedAt&&["APPROVED","ACTIVE"].includes(row.status)&&(!row.employee?.status||["ACTIVE","PROBATION","LEAVE"].includes(row.employee.status))&&(row.status==="ACTIVE"||String(row.endDate).slice(0,10)>=today)).sort((a,b)=>String(a.startDate).localeCompare(String(b.startDate)));
      if(active){setRows(visible);setError("")}
    }).catch(err=>{if(active)setError(err.message)});
    load();window.addEventListener("focus",load);const timer=window.setInterval(load,60000);
    return()=>{active=false;window.removeEventListener("focus",load);window.clearInterval(timer)};
  },[]);
  return (
    <div style={cardStyle}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: "100%",
          height: "3px",
          background:
            "linear-gradient(90deg, rgba(8,122,67,0.90), rgba(212,175,55,0.90), rgba(8,122,67,0.18))",
        }}
      />

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          width: "150px",
          height: "150px",
          right: "-55px",
          bottom: "-70px",
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(8,122,67,0.08), transparent 68%)",
        }}
      />

      <h3 style={titleStyle}>
        Leave Calendar
      </h3>

      {error ? <p role="alert" style={bodyStyle}>{error}</p> : rows===null ? <p role="status" style={bodyStyle}>Loading approved leave…</p> : rows.length===0 ? <p style={bodyStyle}>No current or upcoming approved leave.</p> : <>
        <p style={bodyStyle}>{rows.length} current or upcoming approved/commenced request{rows.length===1?"":"s"}</p>
        <ul style={{paddingLeft:18,color:"var(--chris-text, #30483a)"}}>{rows.slice(0,5).map(row=><li key={row.id} style={{marginBottom:10,fontSize:13}}>
          <strong>{[row.employee?.firstName,row.employee?.lastName].filter(Boolean).join(" ")||row.employee?.employeeNumber}</strong><br/>
          {String(row.startDate).slice(0,10)} → {String(row.endDate).slice(0,10)} · {row.status==="ACTIVE"?"Commenced":"Approved"}
        </li>)}</ul>
      </>}
      <a href="/leave/calendar" style={{color:"#087A43",fontWeight:700}}>View Leave Calendar →</a>
    </div>
  );
}

const cardStyle = {
  background:
    "var(--chris-ui-panel-background, linear-gradient(145deg, rgba(255,255,255,0.985), rgba(246,250,247,0.97)))",

  border:
    "var(--chris-ui-panel-border, 1px solid rgba(212,175,55,0.20))",

  borderRadius:
    "var(--chris-ui-panel-radius, 18px)",

  padding:
    "24px",

  boxShadow:
    "var(--chris-ui-panel-shadow, 0 14px 34px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.90))",

  minHeight:
    "280px",

  position:
    "relative",

  overflow:
    "hidden",
};

const titleStyle = {
  margin:
    0,

  color:
    "#075F36",

  fontSize:
    "17px",

  fontWeight:
    "900",

  letterSpacing:
    "0.01em",

  position:
    "relative",
};

const bodyStyle = {
  margin:
    "10px 0 0",

  color:
    "#6B7D73",

  fontSize:
    "13px",

  lineHeight:
    "1.65",

  fontWeight:
    "600",

  position:
    "relative",
};

export default LeaveCalendar;
