import { useEffect, useState } from "react";
import { apiRequest } from "../../services/api";
import NewsPanel from "./NewsPanel";

export default function Announcements() {
  const [rows,setRows]=useState([]);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    const load=()=>apiRequest("/api/news/published").then(r=>{
      if(active){setRows(r.data||[]);setError("");}
    }).catch(e=>{if(active)setError(e.message||"Unable to load announcements.");});
    load();
    const interval=setInterval(load,60000);
    const onFocus=()=>load();
    window.addEventListener("focus",onFocus);
    return()=>{active=false;clearInterval(interval);window.removeEventListener("focus",onFocus);};
  },[]);
  return <div>{error&&<p role="alert">{error}</p>}<NewsPanel rows={rows} mode="hris"/></div>;
}
