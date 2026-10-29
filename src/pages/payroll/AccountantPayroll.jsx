import { useEffect, useRef, useState } from 'react';
import { apiRequest, apiDownload, saveDownloadedBlob } from '../../services/api';

const money = value => new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN'}).format(Number(value || 0));
const panel={background:'rgba(4,46,28,.72)',border:'1px solid rgba(212,175,55,.35)',borderRadius:14,padding:20,marginBottom:18};
const button={background:'#D4AF37',color:'#05291A',border:0,borderRadius:8,padding:'9px 14px',fontWeight:800,cursor:'pointer'};
const cell={padding:'10px 12px',borderBottom:'1px solid rgba(212,175,55,.18)',textAlign:'left',whiteSpace:'nowrap'};

export default function AccountantPayroll() {
  const [access,setAccess]=useState(null),[scope,setScope]=useState('');
  const [runs,setRuns]=useState([]),[detail,setDetail]=useState(null);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState('');
  const [search,setSearch]=useState('');
  const requestVersion=useRef(0);
  useEffect(()=>{
    let active=true;
    apiRequest('/api/payroll/accountant/access').then(r=>{if(active){setAccess(r.data);setScope(r.data.defaultScope);}})
      .catch(e=>{if(active){setError(e.message);setLoading(false);}});
    return ()=>{active=false;};
  },[]);
  useEffect(()=>{
    if(!scope)return;
    const version=++requestVersion.current;
    setLoading(true);setDetail(null);setRuns([]);setError('');setNotice('');setSearch('');
    apiRequest(`/api/payroll/accountant/runs?scope=${encodeURIComponent(scope)}`)
      .then(r=>{if(version===requestVersion.current)setRuns(r.data || []);})
      .catch(e=>{if(version===requestVersion.current)setError(e.message);})
      .finally(()=>{if(version===requestVersion.current)setLoading(false);});
    return ()=>{requestVersion.current++;};
  },[scope]);
  const view=async run=>{
    const version=++requestVersion.current;
    setBusy(run.id);setError('');setDetail(null);
    try {
      const r=await apiRequest(`/api/payroll/accountant/runs/${run.id}?scope=${encodeURIComponent(scope)}`);
      if(version===requestVersion.current)setDetail(r.data);
    }catch(e){if(version===requestVersion.current)setError(e.message);}
    finally{if(version===requestVersion.current)setBusy('');}
  };
  const download=async run=>{
    setBusy(`export-${run.id}`);setError('');setNotice('');
    try {
      saveDownloadedBlob(await apiDownload(`/api/payroll/accountant/runs/${run.id}/export.xlsx?scope=${encodeURIComponent(scope)}`));
      setNotice('Payroll review copy downloaded. Payroll status remains unchanged.');
    }catch(e){setError(e.message);}finally{setBusy('');}
  };
  const selected=access?.scopes?.find(s=>s.id===scope);
  const lines=(detail?.lines || []).filter(l=>`${l.employeeNumber} ${l.employeeName}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section style={{padding:24,color:'#F7FAF8',maxWidth:1600,margin:'0 auto'}}>
    <div style={{color:'#D4AF37',fontSize:12,fontWeight:900,letterSpacing:2}}>ACCOUNTS & FINANCE</div>
    <h1>Payroll Reports</h1>
    <p>View and export payroll within your assigned access. Head Office is the consolidated company payroll.</p>
    <div style={panel}>
      <label htmlFor="accountant-payroll-scope">Payroll scope </label>
      <select id="accountant-payroll-scope" value={scope} disabled={Boolean(busy)} onChange={e=>setScope(e.target.value)} style={{...button,marginLeft:10,maxWidth:'100%'}}>
        {(access?.scopes || []).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <p style={{color:'#B6CDBF',fontSize:13}}>Read-only reports. Payroll preparation, approvals and the Chief Accountant payout workflow remain with their assigned roles.</p>
    </div>
    {error&&<p role="alert" style={{color:'#FFB4A8'}}>{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <div style={panel}>
      <h2>{selected?.name || 'Payroll runs'}</h2>
      {loading?<p role="status">Loading payrolls…</p>:!runs.length?<p>No payroll runs are available for this scope.</p>:<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr>{['Period','Status','Employees','Gross Salary','Leave Allowance','Total Net Payable','Reports'].map(h=><th key={h} style={cell}>{h}</th>)}</tr></thead>
        <tbody>{runs.map(r=><tr key={r.id}>
          <td style={cell}>{r.periodName || r.periodCode}</td><td style={cell}>{r.status}</td><td style={cell}>{r.employeeCount}</td>
          <td style={cell}>{money(r.grossTotal)}</td><td style={cell}>{money(r.leaveAllowanceTotal)}</td><td style={cell}>{money(r.netPreviewTotal)}</td>
          <td style={cell}><button style={button} disabled={Boolean(busy)} onClick={()=>view(r)}>View</button>{' '}
            {access?.canExport&&<button style={button} disabled={Boolean(busy)} onClick={()=>download(r)}>Export Excel</button>}</td>
        </tr>)}</tbody>
      </table></div>}
    </div>
    {detail&&<div style={panel}>
      <h2>{detail.run.periodName || detail.run.periodCode} · {detail.scope.name}</h2>
      <p>{detail.run.status} · {detail.lines.length} employees · Review copy; not a payout instruction.</p>
      <label htmlFor="accountant-payroll-search">Find employee </label>
      <input id="accountant-payroll-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Employee number or name" style={{padding:9,marginBottom:12,borderRadius:8}}/>
      <div style={{overflowX:'auto',maxHeight:650}}><table style={{width:'100%',borderCollapse:'collapse'}}>
        <thead><tr>{['Employee No','Employee Name','Branch','Gross Salary','Deductions & Recoveries','Leave Allowance','Total Net Payable'].map(h=><th key={h} style={cell}>{h}</th>)}</tr></thead>
        <tbody>{lines.map(l=><tr key={l.id}>
          <td style={cell}>{l.employeeNumber}</td><td style={cell}>{l.employeeName}</td><td style={cell}>{l.details?.organizationSnapshot?.locationName || selected?.name}</td>
          <td style={cell}>{money(l.grossPay)}</td><td style={cell}>{money(Number(l.deductions||0)+Number(l.advanceRecovery||0)+Number(l.loanRecovery||0))}</td>
          <td style={cell}>{money(l.details?.leaveAllowance?.amount)}</td><td style={cell}>{money(l.netPreview)}</td>
        </tr>)}</tbody>
      </table></div>
    </div>}
  </section>;
}
