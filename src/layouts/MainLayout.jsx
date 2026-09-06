import Sidebar from "../components/layout/Sidebar/Sidebar";
import Topbar from "../components/layout/Topbar/Topbar";
import BranchContextSelector from "../components/BranchContextSelector";

function MainLayout({ children }) {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: "#050A07",
      }}
    >
      <Sidebar />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: "#07110C",
          position: "relative",
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
            scrollbarColor: "rgba(212,175,55,0.35) rgba(255,255,255,0.03)",
            position: "relative",
            background:
              "radial-gradient(circle at 8% 5%, rgba(0,145,78,0.14), transparent 25%), radial-gradient(circle at 92% 88%, rgba(212,175,55,0.10), transparent 24%), linear-gradient(135deg, #07110C 0%, #0A1510 48%, #07100B 100%)",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "fixed",
              inset: "72px 0 0 276px",
              pointerEvents: "none",
              overflow: "hidden",
              zIndex: 0,
            }}
          >
            <div
              style={{
                position: "absolute",
                width: "620px",
                height: "220px",
                right: "-150px",
                bottom: "-80px",
                transform: "rotate(-12deg)",
                borderRadius: "50%",
                borderTop: "1px solid rgba(212,175,55,0.20)",
                borderBottom: "1px solid rgba(0,150,78,0.18)",
                boxShadow: "0 -24px 90px rgba(0,145,78,0.06), 0 22px 90px rgba(212,175,55,0.05)",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: "360px",
                height: "360px",
                left: "-120px",
                top: "18%",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(0,150,78,0.10), transparent 68%)",
                filter: "blur(16px)",
              }}
            />
            <div
              style={{
                position: "absolute",
                width: "310px",
                height: "310px",
                right: "-90px",
                top: "5%",
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(212,175,55,0.08), transparent 70%)",
                filter: "blur(18px)",
              }}
            />
          </div>

          <div
            className="chris-page"
            style={{
              width: "100%",
              maxWidth: "1700px",
              margin: "0 auto",
              position: "relative",
              zIndex: 1,
            }}
          >
            <BranchContextSelector />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
