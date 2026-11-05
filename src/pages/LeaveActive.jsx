import {useEffect,useState} from "react";
import {useNavigate} from "react-router-dom";
import {apiRequest,getStoredOrganization} from "../services/api";
import {LeavePage,Panel,Notice,Table,StatusBadge,formatDate,employeeName,daysRemaining,styles} from "../components/leave/LeaveUi";
import {activeLeaves} from "../components/leave/leaveSelectors";

export default function LeaveActive(){
  const nav=useNavigate(),[rows,setRows]=useState([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0);
  useEffect(()=>{
    let active=true;
    const load=()=>apiRequest("/api/leave/requests").then(result=>{
      if(!Array.isArray(result.data))throw new Error("Unable to read active leave requests.");
      if(active){setRows(activeLeaves(result.data,new Date(),getStoredOrganization()?.timezone||"Africa/Lagos"));setError("");}
    }).catch(err=>{if(active)setError(err.message)}).finally(()=>{if(active)setLoading(false)});
    setLoading(true);load();window.addEventListener("focus",load);
    const timer=window.setInterval(load,60000);
    return()=>{active=false;window.removeEventListener("focus",load);window.clearInterval(timer)};
  },[revision]);
  const columns=[
    {key:"employee",label:"Employee",render:r=>`${employeeName(r.employee)} (${r.employee?.employeeNumber})`},
    {key:"policy",label:"Policy",render:r=>r.leavePolicy?`${r.leavePolicy.name} v${r.leavePolicy.versionNumber}`:r.leaveType?.name},
    {key:"status",label:"Status",render:r=><><StatusBadge status={r.status}/>{r.status==="APPROVED"&&<div style={styles.muted}>Approved dates in effect</div>}</>},
    {key:"commenced",label:"Start / Commencement",render:r=>formatDate(r.commencementDate||r.startDate)},
    {key:"end",label:"Approved End Date",render:r=>formatDate(r.endDate)},
    {key:"remaining",label:"Days Remaining",render:r=>daysRemaining(r.endDate)},
    {key:"location",label:"Location",render:r=>r.employee?.location?.name||"-"},
    {key:"department",label:"Department",render:r=>r.employee?.department?.name||"-"},
    {key:"action",label:"Action",render:r=><button style={styles.primary} onClick={()=>nav(r.status==="ACTIVE"?"/leave/returns":"/leave/requests")}>{r.status==="ACTIVE"?"Return to Work":"View Approved Request"}</button>},
  ];
  return <LeavePage title="Active Leave" description="Approved leave in effect today and commenced leave awaiting return. Future approvals appear as upcoming." actions={<button style={styles.button} disabled={loading} onClick={()=>setRevision(v=>v+1)}>Refresh</button>}>
    {error&&<Notice error>{error}</Notice>}
    <Panel>{loading?<p role="status">Loading active leave…</p>:!error&&<Table rows={rows} columns={columns} empty="No approved leave is in effect today and no commenced leave is awaiting return."/>}</Panel>
  </LeavePage>;
}
