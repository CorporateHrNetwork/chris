import Sidebar from "../components/layout/Sidebar/Sidebar";
import Topbar from "../components/layout/Topbar/Topbar";

function MainLayout({ children }) {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        background: "#F5F7FA",
      }}
    >
      <Sidebar />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Topbar />

        <main
          style={{
            flex: 1,
            padding: "30px",
            overflowY: "auto",
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

export default MainLayout;