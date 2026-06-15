/**
 * Navbar.jsx
 * ----------
 * Global navigation bar with active-route highlighting,
 * a live "pulse" indicator, and the SecureLedger brand.
 */

import { Link, useLocation } from "react-router-dom";
import { useState } from "react";

const LINKS = [
  { to: "/",            label: "Dashboard"   },
  { to: "/risk",        label: "Risk Table"  },
  { to: "/rings",       label: "Fraud Rings" },
  { to: "/investigator",label: "Investigator"},
];

export default function Navbar() {
  const { pathname } = useLocation();
  const [hoveredLink, setHoveredLink] = useState(null);

  return (
    <nav style={{
      background: "rgba(255, 255, 255, 0.95)",
      backdropFilter: "blur(12px)",
      borderBottom: "1px solid #E2E8F0",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
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
          background: "#01B8AA",
          boxShadow: "0 0 6px rgba(1,184,170,0.4)",
          animation: "pulse-teal 2s infinite",
        }} />
        <span style={{
          fontWeight: 800,
          fontSize: 20,
          background: "linear-gradient(90deg, #01B8AA, #0EA5E9)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          padding: "4px 0", // Guarantee gradient clip protection
        }}>
          SecureLedger
        </span>
        <span style={{
          fontSize: 11,
          background: "#F0FDFA",
          border: "1px solid #01B8AA",
          color: "#01B8AA",
          padding: "2px 8px",
          borderRadius: 6,
          fontWeight: 700,
          letterSpacing: "0.05em",
        }}>
          AI
        </span>
      </div>

      {/* Links */}
      <div style={{ display: "flex", gap: 6 }}>
        {LINKS.map(({ to, label }) => {
          const active = pathname === to;
          const isHovered = hoveredLink === to;
          
          return (
            <Link
              key={to}
              to={to}
              onMouseEnter={() => setHoveredLink(to)}
              onMouseLeave={() => setHoveredLink(null)}
              style={{
                padding: "8px 18px",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                color: active ? "#01B8AA" : (isHovered ? "#01B8AA" : "#64748B"),
                background: active ? "#F0FDFA" : (isHovered ? "#F8FAFC" : "transparent"),
                border: active ? "1px solid #CCF5F2" : "1px solid transparent",
                textDecoration: "none",
                transition: "all 0.15s ease",
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
        background: "#F0FDF4",
        border: "1px solid #BBF7D0",
        borderRadius: 9999,
        padding: "6px 14px",
        fontSize: 12,
        color: "#16A34A",
        fontWeight: 700,
        letterSpacing: "0.05em"
      }}>
        <span style={{ 
          width: 8, height: 8, borderRadius: "50%", 
          background: "#16A34A", display: "inline-block",
          animation: "pulse-green 2s infinite",
        }} />
        LIVE
      </div>

      {/* Pulse keyframes */}
      <style>{`
        @keyframes pulse-teal {
          0%,100% { opacity: 1; box-shadow: 0 0 6px rgba(1,184,170,0.4); }
          50%     { opacity: 0.5; box-shadow: 0 0 14px rgba(1,184,170,0.8); }
        }
        @keyframes pulse-green {
          0%,100% { opacity: 1; box-shadow: 0 0 4px rgba(22,163,74,0.4); }
          50%     { opacity: 0.6; box-shadow: 0 0 10px rgba(22,163,74,0.7); }
        }
      `}</style>
    </nav>
  );
}