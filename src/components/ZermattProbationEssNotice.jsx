import {useEffect,useState} from 'react';
import {essRequest} from '../services/api';
export default function ZermattProbationEssNotice({onOpen}){
  const [count,setCount]=useState(0);
  useEffect(()=>{let active=true;const refresh=()=>essRequest('/api/ess/probation/notices').then(r=>{if(active)setCount((r.data||[]).length);}).catch(()=>{});refresh();const timer=setInterval(refresh,60000);return()=>{active=false;clearInterval(timer);};},[]);
  return count?<div className="card" role="status"><strong>{count} probation assessment notice{count===1?'':'s'}</strong><button className="ghost" onClick={onOpen}>Open probation assessments</button></div>:null;
}
