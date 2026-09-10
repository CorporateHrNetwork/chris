import { useEffect, useState } from "react";

import Sidebar from "../components/layout/Sidebar/Sidebar";
import Topbar from "../components/layout/Topbar/Topbar";

function MainLayout({ children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const toggleMobileNav = () => setMobileNavOpen((current) => !current);
    const closeMobileNav = () => setMobileNavOpen(false);

    window.addEventListener("chris:toggle-mobile-nav", toggleMobileNav);
    window.addEventListener("chris:close-mobile-nav", closeMobileNav);

    return () => {
      window.removeEventListener("chris:toggle-mobile-nav", toggleMobileNav);
      window.removeEventListener("chris:close-mobile-nav", closeMobileNav);
    };
  }, []);

  return (
    <div
      className="chris-shell"
      style={{
        display: "flex",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
        background: "#050A07",
      }}
    >
      <style>{`
        .chris-mobile-sidebar-wrap {
          flex: 0 0 276px;
          min-width: 276px;
          position: relative;
          z-index: 30;
        }

        .chris-mobile-nav-backdrop {
          display: none;
        }

        @media (max-width: 860px) {
          .chris-shell {
            display: block !important;
            min-width: 0 !important;
          }

          .chris-mobile-sidebar-wrap {
            position: fixed !important;
            inset: 0 auto 0 0;
            width: min(82vw, 300px) !important;
            min-width: 0 !important;
            transform: translateX(-105%);
            transition: transform 180ms ease;
            z-index: 80;
            box-shadow: 18px 0 55px rgba(0,0,0,.46);
          }

          .chris-mobile-sidebar-wrap[data-open="true"] {
            transform: translateX(0);
          }

          .chris-mobile-sidebar-wrap > aside {
            width: 100% !important;
            min-width: 100% !important;
          }

          .chris-mobile-nav-backdrop[data-open="true"] {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,.58);
            z-index: 70;
            border: 0;
            padding: 0;
          }

          .chris-main-column {
            width: 100% !important;
            height: 100dvh !important;
          }

          .chris-main-content {
            padding: 18px 16px 28px !important;
          }

          .chris-shell-ambient {
            inset: 68px 0 0 0 !important;
          }

          .chris-page,
          .chris-dashboard {
            min-width: 0 !important;
            max-width: 100% !important;
          }

          .chris-dashboard > div[style*="minmax(240px"] {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }

          .chris-dashboard > div[style*="minmax(180px"] {
            grid-template-columns: 1fr !important;
          }

          .chris-dashboard > div[style*="minmax(360px"] {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 14px !important;
          }
        }
      `}</style>

      <div
        className="chris-mobile-sidebar-wrap"
        data-open={mobileNavOpen ? "true" : "false"}
        onClick={(event) => {
          if (event.target.closest("a")) setMobileNavOpen(false);
        }}
      >
        <Sidebar />
      </div>

      <button
        type="button"
        aria-label="Close navigation"
        className="chris-mobile-nav-backdrop"
        data-open={mobileNavOpen ? "true" : "false"}
        onClick={() => setMobileNavOpen(false)}
      />

      <div
        className="chris-main-column"
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
          className="chris-main-content"
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
            className="chris-shell-ambient"
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
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export default MainLayout;
