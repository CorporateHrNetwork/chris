import { FaBell, FaSearch } from "react-icons/fa";
import avatar from "../../../assets/images/avatar.png";

function Topbar() {
  const today = new Date().toLocaleDateString("en-NG", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header
      style={{
        height: "80px",
        background: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 30px",
        borderBottom: "1px solid #E5E7EB",
        boxShadow: "0 2px 10px rgba(0,0,0,.05)",
      }}
    >
      {/* Left */}
      <div>
        <h2
          style={{
            margin: 0,
            color: "#0B5E3B",
            fontSize: "24px",
          }}
        >
          Welcome Back 👋
        </h2>

        <span
          style={{
            color: "#666",
            fontSize: "14px",
          }}
        >
          {today}
        </span>
      </div>

      {/* Right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "20px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "#F4F6F8",
            padding: "10px 16px",
            borderRadius: "30px",
            width: "280px",
          }}
        >
          <FaSearch color="#777" />

          <input
            type="text"
            placeholder="Search..."
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              marginLeft: "10px",
              width: "100%",
              fontSize: "14px",
            }}
          />
        </div>

        <FaBell
          size={22}
          color="#0B5E3B"
          style={{
            cursor: "pointer",
          }}
        />

        <img
          src={avatar}
          alt="User"
          style={{
            width: "46px",
            height: "46px",
            borderRadius: "50%",
            objectFit: "cover",
            border: "2px solid #0B5E3B",
          }}
        />
      </div>
    </header>
  );
}

export default Topbar;