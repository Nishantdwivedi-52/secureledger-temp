// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard  from "./pages/Dashboard";
import FraudRings from "./pages/FraudRings";

const NAV_STYLE = ({ isActive }) => ({
  color:          isActive ? "#38bdf8" : "#94a3b8",
  textDecoration: "none",
  fontWeight:     isActive ? 700 : 400,
  padding:        "6px 0",
  borderBottom:   isActive ? "2px solid #38bdf8" : "2px solid transparent",
  fontSize:       14,
});

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: "100vh", background: "#0f172a", fontFamily: "Inter, system-ui, sans-serif" }}>

        {/* Topbar */}
        <header style={{
          background: "#1e293b", borderBottom: "1px solid #334155",
          padding: "0 24px", display: "flex", alignItems: "center", height: 56,
        }}>
          <span style={{ fontWeight: 800, fontSize: 18, color: "#38bdf8", marginRight: 40 }}>
            🔐 SecureLedger
          </span>
          <nav style={{ display: "flex", gap: 32 }}>
            <NavLink to="/"      style={NAV_STYLE} end>Dashboard</NavLink>
            <NavLink to="/rings" style={NAV_STYLE}>Fraud Rings</NavLink>
          </nav>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "#475569" }}>
            PSBs Hackathon 2026 · iDEA 2.0 · PS3
          </span>
        </header>

        {/* Content */}
        <main>
          <Routes>
            <Route path="/"      element={<Dashboard />} />
            <Route path="/rings" element={<FraudRings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
