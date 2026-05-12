import React, { useState, useEffect } from 'react';
import Navbar from "../components/Navbar";

const RiskTable = () => {
  const [accounts, setAccounts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
  // If search is empty, get top 20. If search has text, ask the server for that ID.
  const url = searchTerm 
    ? `http://localhost:5000/api/risk/top?search=${searchTerm}`
    : `http://localhost:5000/api/risk/top?limit=20`;

  fetch(url)
    .then(res => res.json())
    .then(data => setAccounts(data));
}, [searchTerm]); // <--- This 'searchTerm' trigger is the key!

  // 1. Search Logic: Filters rows by Account ID
  const filtered = accounts.filter(acc => 
    acc.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 2. Sorting Logic: Descending by anomaly_score
  const sorted = [...filtered].sort((a, b) => b.anomaly_score - a.anomaly_score);

  // 3. Colored Badge Logic from Section 3.5
  const getBadgeColor = (score) => {
    if (score > 0.7) return '#ef4444'; // Red (High)
    if (score >= 0.4) return '#f59e0b'; // Yellow (Medium)
    return '#10b981'; // Green (Low)
  };

  return (
    <div style={{ backgroundColor: "#0f172a", minHeight: "100vh", color: "white" }}>
      <Navbar />
      <div style={{ padding: "40px" }}>
        <h2 style={{ marginBottom: "20px" }}>Risk Assessment Table</h2>
        
        {/* Search Input */}
        <input 
          type="text" 
          placeholder="Search by Account ID..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ 
            padding: "12px", 
            borderRadius: "8px", 
            width: "100%", 
            maxWidth: "400px", 
            marginBottom: "30px", 
            background: "#1e293b", 
            color: "white", 
            border: "1px solid #334155" 
          }}
        />

        <table style={{ width: "100%", borderCollapse: "collapse", background: "#1e293b", borderRadius: "12px", overflow: "hidden" }}>
          <thead>
            <tr style={{ background: "#334155", textAlign: "left" }}>
              <th style={{ padding: "15px" }}>Account ID</th>
              <th style={{ padding: "15px" }}>Anomaly Score</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(acc => (
              <tr key={acc.id} style={{ borderBottom: "1px solid #334155" }}>
                <td style={{ padding: "15px", fontFamily: "monospace", fontSize: "0.9rem" }}>{acc.id}</td>
                <td style={{ padding: "15px" }}>
                  <span style={{ 
                    background: getBadgeColor(acc.anomaly_score), 
                    padding: "6px 16px", 
                    borderRadius: "20px", 
                    fontWeight: "bold",
                    fontSize: "0.85rem" 
                  }}>
                    {acc.anomaly_score.toFixed(4)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default RiskTable;