function KpiCard({ title, value, subtitle, icon, color }) {
  const accentColor = color === "#D4AF37" ? "#F2CF57" : "#2EE98B";
  return (
    <div className="chris-kpi-card" style={{
      background:"radial-gradient(circle at 18% 0%, rgba(36,217,118,.13), transparent 30%), linear-gradient(145deg, #063722, #02170f)",
      border:"1px solid rgba(212,175,55,0.88)", borderRadius:"20px", padding:"24px",
      boxShadow:"0 18px 42px rgba(0,0,0,0.34)", position:"relative", overflow:"hidden", minHeight:"155px"
    }}>
      <div style={{position:"absolute",right:"22px",top:"20px",width:"48px",height:"48px",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"25px",color:"#F2CF57",background:"radial-gradient(circle, rgba(10,64,38,.88), rgba(1,18,11,.96))",border:"1px solid rgba(212,175,55,.72)"}}>{icon}</div>
      <div style={{color:"#F7FAF8",fontSize:"12px",fontWeight:"900",textTransform:"uppercase",letterSpacing:"0.06em"}}>{title}</div>
      <div style={{color:accentColor,fontSize:"40px",lineHeight:"1",margin:"18px 0 10px",fontWeight:"900"}}>{value}</div>
      <div style={{color:"#C7D3CC",fontSize:"13px",fontWeight:"650"}}>{subtitle}</div>
    </div>
  );
}
export default KpiCard;
