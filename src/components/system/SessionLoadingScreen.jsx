export default function SessionLoadingScreen() {
  return (
    <div role="status" aria-live="polite" style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", boxSizing:"border-box", padding:24, background:"#07110c", color:"#f7faf8", fontFamily:"Arial, Helvetica, sans-serif" }}>
      <div style={{ width:"min(92vw, 460px)", padding:28, border:"1px solid rgba(212,175,55,.45)", borderRadius:16, background:"linear-gradient(145deg,#083221,#03140d)", boxShadow:"0 18px 46px rgba(0,0,0,.28)", textAlign:"center" }}>
        <div style={{ width:58, height:58, margin:"0 auto 16px", display:"grid", placeItems:"center", borderRadius:"50%", background:"#d4af37", color:"#07140d", fontWeight:900, fontSize:21 }}>CH</div>
        <h1 style={{ margin:"0 0 10px", color:"#d4af37", fontSize:22 }}>Starting CHRiS</h1>
        <p style={{ margin:0, color:"#c7d3cc", lineHeight:1.65, fontSize:14 }}>Loading the secure workspace...</p>
      </div>
    </div>
  );
}
