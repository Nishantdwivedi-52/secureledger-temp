/**
 * Navbar.jsx
 * ----------
 * Global navigation bar with active-route highlighting,
 * a live "pulse" indicator, and the SecureLedger brand.
 */

import { Link, useLocation } from "react-router-dom";

const LINKS = [
  { to: "/",            label: "Dashboard"   },
  { to: "/risk",        label: "Risk Table"  },
  { to: "/rings",       label: "Fraud Rings" },
  { to: "/investigator",label: "Investigator"},
];

export default function Navbar() {
  const { pathname } = useLocation();

  return (
    <nav style={{
      background: "rgba(9,11,28,0.95)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid #1e293b",
      padding: "0 32px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      height: 64,
      position: "sticky",
      top: 0,
      zIndex: 100,
    }}>
      {/* Brand */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 10, height: 10, borderRadius: "50%",
          background: "#22c55e",
          boxShadow: "0 0 8px #22c55e",
          animation: "pulse 2s infinite",
        }} />
        <span style={{
          fontWeight: 800,
          fontSize: 20,
          background: "linear-gradient(90deg,#a855f7,#ec4899)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}>
          SecureLedger
        </span>
        <span style={{
          fontSize: 10,
          background: "#1e293b",
          border: "1px solid #334155",
          color: "#64748b",
          padding: "2px 8px",
          borderRadius: 9999,
          fontWeight: 600,
        }}>
          AI
        </span>
      </div>

      {/* Links */}
      <div style={{ display: "flex", gap: 4 }}>
        {LINKS.map(({ to, label }) => {
          const active = pathname === to;
          return (
            <Link
              key={to}
              to={to}
              style={{
                padding: "8px 18px",
                borderRadius: 10,
                fontSize: 14,
                fontWeight: active ? 700 : 500,
                color: active ? "#c4b5fd" : "#94a3b8",
                background: active ? "#1e1b4b" : "transparent",
                border: `1px solid ${active ? "#4c1d95" : "transparent"}`,
                textDecoration: "none",
                transition: "all 0.15s",
              }}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Status pill */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#0f2b1b",
        border: "1px solid #166534",
        borderRadius: 9999,
        padding: "6px 14px",
        fontSize: 12,
        color: "#4ade80",
        fontWeight: 600,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
        LIVE
      </div>

      {/* Pulse keyframe — injected once */}
      <style>{`
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.4; }
        }
      `}</style>
    </nav>
  );
}