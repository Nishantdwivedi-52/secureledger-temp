import React, { useState, useEffect } from 'react';
import Navbar from "../components/Navbar";
import GraphViz from "../components/GraphViz"; // Bring in the graph visualization component

const RiskTable = () => {
  const [accounts, setAccounts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // State to track which account is clicked for investigation
  const [selectedAccount, setSelectedAccount] = useState(null);

  useEffect(() => {
    // FIX: Updated to 127.0.0.1:8000 to hit your running Python server
    const url = searchTerm 
      ? `http://127.0.0.1:8000/api/risk/top?search=${searchTerm}`
      : `http://127.0.0.1:8000/api/risk/top?limit=20`;

    fetch(url)
      .then(res => res.json())
      .then(data => setAccounts(data))
      .catch(err => console.error("Error fetching data:", err));
  }, [searchTerm]); 

  // 1. Search Logic: Filters rows by Account ID
  const filtered = accounts.filter(acc => 
    acc.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 2. Sorting Logic: Descending by anomaly_score
  const sorted = [...filtered].sort((a, b) => b.anomaly_score - a.anomaly_score);

  // 3. Colored Badge Logic
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
              <tr 
                key={acc.id} 
                onClick={() => setSelectedAccount(acc.id)} // Select account on click
                style={{ 
                  borderBottom: "1px solid #334155",
                  cursor: "pointer",
                  // Highlight the row if it's the one selected
                  background: selectedAccount === acc.id ? "#334155" : "transparent"
                }}
              >
                <td style={{ padding: "15px", fontFamily: "monospace", fontSize: "0.9rem" }}>{acc.id}</td>
                <td style={{ padding: "15px" }}>
                  <span style={{ 
                    background: getBadgeColor(acc.anomaly_score), 
                    padding: "6px 16px", 
                    borderRadius: "20px", 
                    fontWeight: "bold",
                    fontSize: "0.85rem",
                    color: acc.anomaly_score >= 0.4 && acc.anomaly_score <= 0.7 ? '#000' : '#fff'
                  }}>
                    {acc.anomaly_score.toFixed(4)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* GraphViz Panel rendering container below the table */}
        <div style={{ marginTop: '40px', padding: '20px', borderRadius: '12px', background: '#1e293b', border: '1px solid #334155' }}>
          {selectedAccount ? (
            <div>
              <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'white' }}>
                Investigating Account: <span style={{fontFamily: 'monospace'}}>{selectedAccount.substring(0, 8)}</span>
              </h3>
              <GraphViz accountId={selectedAccount} />
            </div>
          ) : (
            <p style={{ color: '#94a3b8' }}>Click an account row in the table above to visualize its network risk graph.</p>
          )}
        </div>

      </div>
    </div>
  );
};

export default RiskTable;