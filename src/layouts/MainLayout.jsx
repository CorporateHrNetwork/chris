import Sidebar from "../components/layout/Sidebar/Sidebar";
import Topbar from "../components/layout/Topbar/Topbar";

function MainLayout({
  children,
}) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: "#F5F7FA",
      }}
    >
      {/* LEFT PANE */}
      <Sidebar />

      {/* RIGHT PANE */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "#F5F7FA",
        }}
      >
        <Topbar />

        <main
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "28px 30px 36px",
            boxSizing: "border-box",
            scrollbarWidth: "thin",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "1700px",
              margin: "0 auto",
            }}
          >
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;