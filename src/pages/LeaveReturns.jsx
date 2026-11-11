/* eslint-disable react-hooks/set-state-in-effect */
import {useEffect,useState} from "react";
import {apiRequest,IS_SALES_DEMO_HOST} from "../services/api";
import useAuthorization from "../hooks/useAuthorization";
import {LeavePage,Panel,Notice,Table,StatusBadge,formatDate,employeeName,styles} from "../components/leave/LeaveUi";
import {returnQueue} from "../components/leave/leaveSelectors";
export default function LeaveReturns(){const {hasPermission,loading:permissionLoading}=useAuthorization(),canEdit=!IS_SALES_DEMO_HOST&&hasPermission("leave.manage"),[rows,setRows]=useState([]),[history,setHistory]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState(""),[dates,setDates]=useState({});
async function load() {
  setLoading(true);
  setError("");
  try {
    const [response, completed] = await Promise.all([
      apiRequest("/api/leave/requests?status=ACTIVE"),
      apiRequest("/api/leave/requests?status=COMPLETED"),
    ]);
    if (!Array.isArray(response?.data) || !Array.isArray(completed?.data)) throw new Error("Unable to load return-to-work cases.");
    setRows(returnQueue(response.data));
    setHistory((completed.data || []).filter((row) => row.status === "COMPLETED" && row.actualReturnDate)
      .sort((left, right) => right.actualReturnDate.localeCompare(left.actualReturnDate)));
  } catch (requestError) {
    setError(requestError.message || "Unable to load return-to-work cases.");
    setRows([]);
    setHistory([]);
  } finally {
    setLoading(false);
  }
}
useEffect(()=>{load()},[]);
useEffect(()=>{if(!message)return undefined;const timer=window.setTimeout(()=>setMessage(""),4000);return()=>window.clearTimeout(timer)},[message]);
async function submit(request){setError("");try{await apiRequest(`/api/leave/requests/${request.id}/return`,{method:"POST",body:JSON.stringify({returnDate:dates[request.id]||new Date().toISOString().slice(0,10)})});setMessage(`${employeeName(request.employee)} returned to work.`);await load()}catch(e){setError(e.message||"Unable to complete return to work.")}}
const columns=[{key:"employee",label:"Employee",render:r=>`${employeeName(r.employee)} (${r.employee?.employeeNumber})`},{key:"type",label:"Leave Type",render:r=>r.leaveType?.name},{key:"status",label:"Status",render:r=><StatusBadge status={r.status}/>},{key:"expected",label:"Expected Return",render:r=>formatDate(r.endDate)},{key:"actual",label:"Actual Return",render:r=><input style={styles.input} type="date" value={dates[r.id]||new Date().toISOString().slice(0,10)} onChange={e=>setDates({...dates,[r.id]:e.target.value})}/>},{key:"rules",label:"Return Requirements",render:r=>r.leavePolicy?.lifecycleRules?.returnDocumentationRequired?"Documentation required":r.leavePolicy?.lifecycleRules?.fitnessCertificateRequired?"Fitness-to-work required":"No additional requirement"},{key:"action",label:"Action",render:r=><button disabled={!canEdit} style={{...styles.primary,opacity:canEdit?1:.5}} onClick={()=>submit(r)}>Confirm Return</button>}];
const historyColumns = [
  columns[0], columns[1], columns[2],
  { key: "endDate", label: "Approved Leave End", render: (row) => formatDate(row.endDate) },
  { key: "actualReturnDate", label: "Confirmed Return Date", render: (row) => formatDate(row.actualReturnDate) },
];
return <LeavePage title="Return to Work" description="Review the active return queue and confirmed return history.">
  {!IS_SALES_DEMO_HOST && !permissionLoading && !canEdit && <Notice error>Return confirmation requires leave.manage permission.</Notice>}
  {error && <Notice error>{error}</Notice>}
  {message && <Notice>{message}</Notice>}
  <Panel title="Return Queue">
    {loading ? <div style={styles.empty}>Loading return-to-work cases…</div> :
      <Table rows={rows} columns={IS_SALES_DEMO_HOST ? [columns[0], columns[1], columns[2], { ...columns[3], label: "Approved Leave End" }, columns[5]] : columns}
        empty={error ? "Return queue unavailable." : "No employees are currently awaiting return-to-work processing."} />}
  </Panel>
  <div id="return-history"><Panel title="Confirmed Return History">
    <Table rows={history} columns={historyColumns} empty={loading ? "Loading return history…" : error ? "Return history unavailable." : "No confirmed returns recorded."} />
  </Panel></div>
</LeavePage>;
}
