import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import RiskCard from "../components/RiskCard";

export default function Dashboard() {
  // 1. Initialize state with zeros so the app doesn't crash on first load
  const [stats, setStats] = useState({
    total_accounts: 0,
    high_risk_accounts: 0,
    avg_risk: 0
  });

  useEffect(() => {
    // 2. Fetch the actual data
    fetch("http://localhost:5000/api/dashboard/stats")
      .then((res) => res.json())
      .then((data) => {
        setStats(data);
      })
      .catch((err) => console.error("Error fetching dashboard stats:", err));
  }, []);

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh", color: "white" }}>
      <Navbar />

      <div style={{ padding: "30px" }}>
        <h1 style={{ fontWeight: "bold", fontSize: "2rem" }}>SecureLedger Dashboard</h1>

        <div style={{ display: "flex", gap: "20px", marginTop: "30px" }}>
          {/* 3. Use the 'stats' variable with fallbacks to prevent crashes */}
          <RiskCard 
            title="Total Accounts" 
            value={(stats.total_accounts || 0).toLocaleString()} 
          />
          
          <RiskCard 
            title="High Risk Accounts" 
            value={(stats.high_risk_accounts || 0).toLocaleString()} 
            type="danger" 
          />
          
          <RiskCard 
            title="Avg Anomaly Score" 
            value={(stats.avg_risk || 0).toFixed(2)} 
          />
        </div>
      </div>
    </div>
  );
}