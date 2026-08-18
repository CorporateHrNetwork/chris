import useAuthorization from "../../hooks/useAuthorization";
function DashboardHeader() {
  const today = new Date();
  const { roles, profile, loading } = useAuthorization();
  const date = today.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  const hour = today.getHours();
  let greeting = "Good Morning";
  if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
  if (hour >= 17) greeting = "Good Evening";
  const displayRole = loading ? "Loading..." : roles.length > 0 ? roles[0] : "CHRIS User";
  const firstName = profile?.firstName || "";
  return (
    <div style={{marginBottom:"35px"}}>
      <div style={{fontSize:"13px",color:"#F2CF57",marginBottom:"8px",fontWeight:"900",letterSpacing:"0.10em",textTransform:"uppercase"}}>
        {greeting}{firstName ? `, ${firstName}` : ","}
      </div>
      <h1 style={{margin:0,color:"#F7FAF8",fontSize:"42px",fontWeight:"850"}}>{displayRole}</h1>
      <p style={{marginTop:"8px",color:"#9FB1A7",fontSize:"15px",fontWeight:"600"}}>{date}</p>
    </div>
  );
}
export default DashboardHeader;
