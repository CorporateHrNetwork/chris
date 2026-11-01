import {useEffect,useState} from 'react';
export default function DisciplinaryEssNotice({essRequest,onOpen}) {
 const [count,setCount]=useState(0);
 useEffect(()=>{let active=true;const refresh=()=>essRequest('/api/ess/disciplinary-workflow/cases').then(r=>{if(active)setCount((r.data||[]).filter(c=>['EMPLOYEE_RESPONSE','DECIDED','APPEAL'].includes(c.workflow?.stage)).length);}).catch(()=>{});refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);};},[essRequest]);
 return count?<div className="card" role="status"><strong>{count} disciplinary case update{count===1?'':'s'} available for your review</strong><p>Open your cases to view a query, response deadline, decision or appeal update.</p><button className="ghost" onClick={onOpen}>Open my disciplinary cases</button></div>:null;
}
