import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {apiRequest,getStoredOrganization} from '../services/api';
export default function ZermattProbationNotice(){
  const [count,setCount]=useState(0);
  const zermatt=getStoredOrganization()?.slug==='zermatt-liquor-limited';
  useEffect(()=>{
    if(!zermatt)return;
    let active=true;
    const refresh=()=>apiRequest('/api/zermatt/probation/notices').then(r=>{if(active)setCount((r.data||[]).length);}).catch(()=>{});
    refresh();const timer=setInterval(refresh,60000);
    return ()=>{active=false;clearInterval(timer);};
  },[zermatt]);
  if(!zermatt)return null;
  return <aside aria-label="Probation notifications" style={{padding:'8px 24px',borderBottom:'1px solid #C89B2C',background:'#09251a',color:'#fff'}}><Link to="/employees/probation-reviews" style={{color:'#E7C86C'}}>Probation assessments{count?` · ${count} unread notice${count===1?'':'s'}`:''}</Link></aside>;
}
