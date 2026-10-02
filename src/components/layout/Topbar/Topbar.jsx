import {
  FaBell,
  FaSearch,
  FaBars,
  FaClipboardCheck,
  FaCalendarAlt,
  FaMoneyCheckAlt,
  FaBullhorn,
  FaHeadset,
} from "react-icons/fa";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import avatar from "../../../assets/images/avatar.png";
import BranchContextSelector from "../../BranchContextSelector";

import {
  apiRequest,
  getStoredUser,
  getStoredOrganization,
} from "../../../services/api";

const TOPBAR_SEARCH_ITEMS = [
  ["Dashboard", "/"],
  ["Employees", "/employees"],
  ["Employee Directory", "/employees/directory"],
  ["Employee Profiles", "/employees/profiles"],
  ["Onboarding", "/employees/onboarding"],
  ["Employee Analytics", "/employees/analytics"],
  ["Transfers", "/employees/transfers"],
  ["Promotions", "/employees/promotions"],
  ["Exits", "/employees/exits"],
  ["Internal News", "/employees/news"],
  ["Recruitment", "/recruitment"],
  ["Attendance", "/attendance"],
  ["Worked Days", "/attendance/worked-days"],
  ["Overtime", "/attendance/overtime"],
  ["Public Holidays", "/attendance/public-holidays"],
  ["Leave", "/leave"],
  ["Leave Requests", "/leave/requests"],
  ["Leave Balances", "/leave/balances"],
  ["Leave Policies", "/leave/policies"],
  ["Payroll", "/payroll"],
  ["Execute Payroll", "/payroll?workspace=execute"],
  ["Salary Rates", "/payroll?workspace=rates"],
  ["Allowances", "/payroll?workspace=allowances"],
  ["Deductions", "/payroll?workspace=deductions"],
  ["Payslips", "/payroll?workspace=payslips"],
  ["Payroll Approvals", "/payroll?workspace=approvals"],
  ["Loans", "/loans"],
  ["Salary Advances", "/payroll?workspace=salary-advances"],
  ["Training", "/training"],
  ["Reports", "/reports"],
  ["Statutories", "/statutories"],
  ["Remittances", "/statutories/remittances"],
  ["Documents", "/documents"],
  ["Organization", "/organization"],
  ["Cost Centres", "/organization/cost-centres"],
  ["Settings", "/settings"],
  ["Users & Roles", "/settings"],
  ["Support", "/support"],
];

const SEARCH_SYNONYMS = {
  "/employees": "staff workforce people employee staff member",
  "/employees/directory": "staff employee people directory search employee id name",
  "/employees/profiles": "staff profile employee record biodata personal details",
  "/employees/onboarding": "new hire recruit joiner onboarding employment",
  "/employees/analytics": "workforce analytics headcount employee dashboard",
  "/employees/transfers": "transfer movement relocation branch move",
  "/employees/promotions": "promotion upgrade advancement role change",
  "/employees/news": "news announcement memo circular communication internal career event",
  "/leave": "leave holiday absence vacation entitlement",
  "/leave/requests": "leave approval request pending approval",
  "/leave/balances": "leave balance entitlement ledger available days",
  "/payroll": "salary pay wages payroll",
  "/payroll?workspace=execute": "run process calculate payroll salary pay",
  "/payroll?workspace=rates": "salary rate pay rate compensation gross",
  "/payroll?workspace=allowances": "allowance benefit earning payroll",
  "/payroll?workspace=deductions": "deduction recovery payroll",
  "/payroll?workspace=payslips": "payslip pay slip salary slip email payslip",
  "/payroll?workspace=approvals": "payroll approval approve submitted payroll",
  "/loans": "loan employee loan recovery",
  "/payroll?workspace=salary-advances": "salary advance advance recovery",
  "/training": "training learning course development",
  "/reports": "report export analytics",
  "/statutories": "paye pension tax nsitf nhis itf statutory",
  "/statutories/remittances": "remittance pension paye tax statutory payment",
  "/documents": "document file upload attachment",
  "/organization": "company organisation organization setup",
  "/organization/cost-centres": "cost centre department cost center",
  "/settings": "settings users roles access permissions configuration",
  "/support": "support help issue ticket request",
};

function searchScore(label, path, term) {
  const haystack = `${label} ${path} ${SEARCH_SYNONYMS[path] || ""}`.toLowerCase();
  const words = term.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  let score = 0;
  for (const word of words) {
    if (label.toLowerCase().startsWith(word)) score += 12;
    else if (label.toLowerCase().includes(word)) score += 8;
    if ((SEARCH_SYNONYMS[path] || "").includes(word)) score += 5;
    if (path.toLowerCase().includes(word)) score += 3;
  }
  return words.every((word) => haystack.includes(word)) ? score + 2 : 0;
}


const TOPBAR_ACTIONS = [
  { label: "Approval Inbox", description: "Review workflow items requiring action.", path: "/workflows/approval-inbox", icon: <FaClipboardCheck /> },
  { label: "Leave Requests", description: "Review employee leave requests and approvals.", path: "/leave/requests", icon: <FaCalendarAlt /> },
  { label: "Payroll Approvals", description: "Open payroll approval controls.", path: "/payroll?workspace=approvals", icon: <FaMoneyCheckAlt /> },
  { label: "Internal News", description: "Publish or review Zermatt employee news.", path: "/employees/news", icon: <FaBullhorn /> },
  { label: "Support Requests", description: "Open CHRiS support requests.", path: "/support", icon: <FaHeadset /> },
];

function Topbar() {
  const navigate = useNavigate();
  const user = getStoredUser();
  const organization = getStoredOrganization();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationItems, setNotificationItems] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const topbarRef = useRef(null);

  const searchResults = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return [];
    return TOPBAR_SEARCH_ITEMS
      .map(([label, path]) => ({ label, path, score: searchScore(label, path, term) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [searchQuery]);

  useEffect(() => {
    const onPointerDown = (event) => {
      if (topbarRef.current && !topbarRef.current.contains(event.target)) {
        setSearchOpen(false);
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const openSearchResult = (path) => {
    setSearchQuery("");
    setSearchOpen(false);
    navigate(path);
  };

  const loadNotifications = async () => {
    setNotificationsLoading(true);
    const [payrollResult, newsResult, leaveResult] = await Promise.allSettled([
      apiRequest("/api/payroll/approvals"),
      apiRequest("/api/news"),
      apiRequest("/api/leave/overview"),
    ]);
    const items = [];

    if (payrollResult.status === "fulfilled") {
      const rows = Array.isArray(payrollResult.value?.data) ? payrollResult.value.data : [];
      const pending = rows.filter((row) => !["APPROVED", "REJECTED", "CLOSED"].includes(String(row?.status || "").toUpperCase())).length;
      if (pending > 0) items.push({ label: "Payroll approvals", description: `${pending} payroll item${pending === 1 ? "" : "s"} require attention.`, path: "/payroll?workspace=approvals", icon: <FaMoneyCheckAlt />, count: pending });
    }

    if (newsResult.status === "fulfilled") {
      const rows = Array.isArray(newsResult.value?.data) ? newsResult.value.data : [];
      const drafts = rows.filter((row) => String(row?.status || "").toUpperCase() === "DRAFT").length;
      if (drafts > 0) items.push({ label: "Internal News drafts", description: `${drafts} draft communication${drafts === 1 ? "" : "s"} awaiting publication or review.`, path: "/employees/news", icon: <FaBullhorn />, count: drafts });
    }

    if (leaveResult.status === "fulfilled") {
      const data = leaveResult.value?.data || {};
      const pending = Number(data.pendingRequests ?? data.pending ?? data.summary?.pendingRequests ?? data.summary?.pending ?? 0);
      if (Number.isFinite(pending) && pending > 0) items.push({ label: "Leave requests", description: `${pending} leave request${pending === 1 ? "" : "s"} require attention.`, path: "/leave/requests", icon: <FaCalendarAlt />, count: pending });
    }

    setNotificationItems(items);
    setNotificationsLoading(false);
  };

  const today = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const userName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() ||
    "CHRIS User";

  const organizationName = organization?.name || "CHRIS";

  const toggleMobileNavigation = () => {
    window.dispatchEvent(new CustomEvent("chris:toggle-mobile-nav"));
  };

  return (
    <header
      ref={topbarRef}
      className="chris-topbar-shell"
      style={{
        height: "78px",
        minHeight: "78px",
        flexShrink: 0,
        background:
          "linear-gradient(90deg, #030705 0%, #06110C 48%, #081A11 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
        padding: "0 22px",
        borderBottom: "1px solid rgba(212,175,55,0.24)",
        boxShadow:
          "0 5px 22px rgba(0,0,0,0.30), 0 1px 0 rgba(8,122,67,0.12)",
        boxSizing: "border-box",
        position: "relative",
        zIndex: 20,
        overflow: "visible",
      }}
    >
      <style>{`
        @media (max-width: 860px) {
          .chris-topbar-shell {
            height: 68px !important;
            min-height: 68px !important;
            padding: 0 12px !important;
            gap: 8px !important;
            overflow: visible !important;
          }

          .chris-mobile-menu-button {
            display: flex !important;
            flex: 0 0 auto;
          }

          .chris-topbar-brand {
            flex: 1 1 auto;
            min-width: 0 !important;
          }

          .chris-topbar-brand-name {
            font-size: 13px !important;
            max-width: 34vw;
          }

          .chris-topbar-date {
            display: none !important;
          }

          .chris-topbar-actions {
            flex: 0 1 auto !important;
            gap: 7px !important;
          }

          .chris-topbar-search,
          .chris-topbar-notifications {
            display: none !important;
          }

          .chris-topbar-user {
            gap: 6px !important;
            padding-left: 0 !important;
            max-width: 42vw;
          }

          .chris-topbar-user img {
            width: 34px !important;
            height: 34px !important;
          }

          .chris-topbar-user-copy {
            max-width: 24vw !important;
          }

          .chris-topbar-user-name {
            font-size: 11px !important;
          }
        }
      `}</style>

      <div
        className="chris-topbar"
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
          zIndex: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: "260px",
            height: "140px",
            left: "8%",
            top: "-70px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(8,122,67,0.18), transparent 70%)",
            filter: "blur(10px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "240px",
            height: "120px",
            right: "12%",
            bottom: "-70px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(212,175,55,0.12), transparent 70%)",
            filter: "blur(10px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            width: "52%",
            height: "1px",
            right: "0",
            bottom: "0",
            background:
              "linear-gradient(90deg, transparent, rgba(8,122,67,0.38), rgba(212,175,55,0.62), transparent)",
          }}
        />
      </div>

      <div
        className="chris-topbar-brand"
        style={{
          minHeight: "50px",
          display: "flex",
          alignItems: "center",
          gap: "14px",
          minWidth: 0,
          position: "relative",
          zIndex: 1,
        }}
      >
        <button
          type="button"
          className="chris-mobile-menu-button"
          onClick={toggleMobileNavigation}
          style={{
            display: "none",
            alignItems: "center",
            justifyContent: "center",
            width: "38px",
            height: "38px",
            border: "1px solid rgba(212,175,55,0.28)",
            borderRadius: "9px",
            background:
              "linear-gradient(145deg, rgba(255,255,255,0.035), rgba(8,122,67,0.10))",
            color: "#D4AF37",
            boxShadow: "inset 0 0 12px rgba(8,122,67,0.05)",
            cursor: "pointer",
          }}
          aria-label="Open navigation"
        >
          <FaBars />
        </button>

        <div style={{ minWidth: 0 }}>
          <div
            className="chris-topbar-brand-name"
            style={{
              color: "#087A43",
              fontSize: "18px",
              fontWeight: "900",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              textShadow: "none",
            }}
          >
            {organizationName}
          </div>
          <div
            className="chris-topbar-date"
            style={{
              marginTop: "3px",
              color: "#D4AF37",
              fontSize: "11px",
              fontWeight: "700",
              letterSpacing: "0.01em",
            }}
          >
            {today}
          </div>
        </div>
      </div>

      <div
        className="chris-topbar-actions"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "12px",
          minWidth: 0,
          position: "relative",
          zIndex: 1,
          flex: 1,
        }}
      >
        <BranchContextSelector compact />

        <div className="chris-topbar-search" style={{ width:"220px", maxWidth:"22vw", position:"relative" }}>
          <div style={{ display:"flex", alignItems:"center", padding:"9px 12px", border:"1px solid rgba(8,122,67,0.42)", borderRadius:"10px", background:"rgba(2,10,7,0.56)", boxShadow:"inset 0 0 16px rgba(8,122,67,0.04), 0 0 12px rgba(0,0,0,0.10)" }}>
            <FaSearch size={13} color="#D4AF37" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true); setNotificationsOpen(false); }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
                if (event.key === "Enter" && searchResults[0]) openSearchResult(searchResults[0].path);
              }}
              placeholder="Search CHRiS..."
              aria-label="Search CHRiS navigation"
              style={{ width:"100%", border:"none", outline:"none", background:"transparent", marginLeft:"9px", color:"#F8FAF9", fontSize:"13px" }}
            />
          </div>
          {searchOpen && searchQuery.trim() && (
            <div role="listbox" aria-label="CHRiS search results" style={{ position:"absolute", top:"46px", left:0, right:0, minWidth:280, maxHeight:320, overflowY:"auto", background:"#06110C", border:"1px solid rgba(212,175,55,.35)", borderRadius:10, boxShadow:"0 16px 36px rgba(0,0,0,.48)", zIndex:80, padding:6 }}>
              {searchResults.length ? searchResults.map((item) => (
                <button key={`${item.label}-${item.path}`} type="button" onClick={() => openSearchResult(item.path)} style={{ width:"100%", border:0, borderBottom:"1px solid rgba(255,255,255,.05)", background:"transparent", color:"#DCEBE3", textAlign:"left", padding:"10px 11px", cursor:"pointer", fontSize:12 }}>
                  <strong style={{ color:"#F7FAF8" }}>{item.label}</strong>
                  <span style={{ display:"block", marginTop:3, color:"#7FA391", fontSize:10 }}>{item.path}</span>
                </button>
              )) : <div style={{ padding:12, color:"#9DB8AA", fontSize:12 }}>No matching CHRiS workspace.</div>}
            </div>
          )}
        </div>

        <div className="chris-topbar-notifications" style={{ position:"relative" }}>
          <button
            type="button"
            title="Notifications and actions"
            aria-label="Open notifications and actions"
            aria-expanded={notificationsOpen}
            onClick={() => {
              const next = !notificationsOpen;
              setNotificationsOpen(next);
              setSearchOpen(false);
              if (next) loadNotifications();
            }}
            style={{ position:"relative", width:"38px", height:"38px", display:"flex", alignItems:"center", justifyContent:"center", border:"1px solid rgba(212,175,55,0.30)", borderRadius:"9px", background:"linear-gradient(145deg, rgba(255,255,255,0.035), rgba(8,122,67,0.09))", color:"#D4AF37", cursor:"pointer", boxShadow:"0 0 14px rgba(212,175,55,0.06)" }}
          >
            <FaBell />
            {notificationItems.length > 0 && <span aria-label={`${notificationItems.reduce((sum,item)=>sum+(item.count||0),0)} notifications`} style={{position:"absolute",top:-5,right:-5,minWidth:17,height:17,padding:"0 4px",borderRadius:999,background:"#D4AF37",color:"#07110c",fontSize:9,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #06110C"}}>{notificationItems.reduce((sum,item)=>sum+(item.count||0),0)}</span>}
          </button>
          {notificationsOpen && (
            <div style={{ position:"absolute", top:46, right:0, width:330, background:"#06110C", border:"1px solid rgba(212,175,55,.35)", borderRadius:12, boxShadow:"0 18px 42px rgba(0,0,0,.52)", zIndex:80, overflow:"hidden" }}>
              <div style={{ padding:"12px 14px", borderBottom:"1px solid rgba(212,175,55,.18)" }}>
                <strong style={{ display:"block", color:"#F7D66A", fontSize:13 }}>Notifications & Actions</strong>
                <span style={{ display:"block", marginTop:4, color:"#8FA79A", fontSize:10, lineHeight:1.4 }}>Quick access to CHRiS items that commonly require attention.</span>
              </div>
              <div style={{ padding:6 }}>
                {notificationsLoading ? <div style={{padding:12,color:"#9DB8AA",fontSize:12}}>Checking current CHRiS activity…</div> : notificationItems.length ? (
                  <>
                    <div style={{padding:"7px 9px 5px",color:"#D4AF37",fontSize:10,fontWeight:900,letterSpacing:.8}}>NEEDS ATTENTION</div>
                    {notificationItems.map((item) => (
                      <button key={`notice-${item.path}-${item.label}`} type="button" onClick={() => { setNotificationsOpen(false); navigate(item.path); }} style={{ width:"100%", display:"grid", gridTemplateColumns:"28px 1fr auto", gap:9, alignItems:"start", border:0, borderBottom:"1px solid rgba(255,255,255,.05)", background:"rgba(212,175,55,.04)", color:"#DCEBE3", padding:"10px 9px", textAlign:"left", cursor:"pointer" }}>
                        <span style={{ color:"#D4AF37", fontSize:14, paddingTop:2 }}>{item.icon}</span>
                        <span><strong style={{ display:"block", color:"#F7FAF8", fontSize:12 }}>{item.label}</strong><small style={{ display:"block", marginTop:3, color:"#8FA79A", lineHeight:1.35 }}>{item.description}</small></span>
                        <span style={{background:"#D4AF37",color:"#07110c",borderRadius:999,padding:"2px 6px",fontSize:9,fontWeight:900}}>{item.count}</span>
                      </button>
                    ))}
                  </>
                ) : <div style={{padding:12,color:"#9DB8AA",fontSize:12}}>No new actionable notifications found.</div>}
                <div style={{padding:"10px 9px 5px",color:"#6F8D7D",fontSize:10,fontWeight:900,letterSpacing:.8}}>QUICK ACTIONS</div>
                {TOPBAR_ACTIONS.map((item) => (
                  <button key={item.path} type="button" onClick={() => { setNotificationsOpen(false); navigate(item.path); }} style={{ width:"100%", display:"grid", gridTemplateColumns:"28px 1fr", gap:9, alignItems:"start", border:0, borderBottom:"1px solid rgba(255,255,255,.05)", background:"transparent", color:"#DCEBE3", padding:"10px 9px", textAlign:"left", cursor:"pointer" }}>
                    <span style={{ color:"#D4AF37", fontSize:14, paddingTop:2 }}>{item.icon}</span>
                    <span><strong style={{ display:"block", color:"#F7FAF8", fontSize:12 }}>{item.label}</strong><small style={{ display:"block", marginTop:3, color:"#8FA79A", lineHeight:1.35 }}>{item.description}</small></span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div
          className="chris-topbar-user"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            paddingLeft: "4px",
          }}
        >
          <img
            src={avatar}
            alt={userName}
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid #D4AF37",
              boxShadow:
                "0 0 12px rgba(212,175,55,0.16), 0 0 14px rgba(8,122,67,0.12)",
            }}
          />
          <div className="chris-topbar-user-copy" style={{ maxWidth: "140px" }}>
            <div
              className="chris-topbar-user-name"
              style={{
                color: "#087A43",
                fontSize: "12px",
                fontWeight: "800",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {userName}
            </div>
            <div
              style={{
                marginTop: "2px",
                color: "#9DB8AA",
                fontSize: "10px",
              }}
            >
              Signed in
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Topbar;
