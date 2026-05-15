import React, { useState, useEffect } from 'react';
import axios from 'axios';
import GraphViz from './GraphViz';

const RiskTable = () => {
  const [accounts, setAccounts] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // NEW: State to keep track of the clicked account ID
  const [selectedAccount, setSelectedAccount] = useState(null);

  // 1. Fetch data from your API
  useEffect(() => {
    // Note: Updated to port 8000 to match the FastAPI setup in the guide
    axios.get('http://127.0.0.1:8000/api/risk/top?limit=20') 
      .then(res => setAccounts(res.data))
      .catch(err => console.error("Error fetching risk data:", err));
  }, []);

  // 2. Search Filter: Filters by Account ID (Client-side)
  const filtered = accounts.filter(acc => 
    acc.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 3. Sort: Descending by anomaly_score by default
  const sorted = [...filtered].sort((a, b) => b.anomaly_score - a.anomaly_score);

  // 4. Badge Logic: Precise thresholds from Section 3.5
  const getBadgeColor = (score) => {
    if (score > 0.7) return '#ef4444'; // Red
    if (score >= 0.4) return '#f59e0b'; // Yellow
    return '#10b981'; // Green
  };

  return (
    <div style={{ marginTop: '40px', color: 'white' }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '20px' }}>Risk Assessment Table</h2>
      
      {/* Search Input */}
      <input 
        type="text" 
        placeholder="Filter by Account ID..." 
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        style={{
          width: '100%',
          maxWidth: '400px',
          padding: '10px',
          marginBottom: '20px',
          borderRadius: '8px',
          border: '1px solid #334155',
          background: '#1e293b',
          color: 'white'
        }}
      />

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#1e293b', borderRadius: '12px', overflow: 'hidden' }}>
        <thead>
          <tr style={{ background: '#334155', textAlign: 'left' }}>
            <th style={{ padding: '15px' }}>Account ID</th>
            <th style={{ padding: '15px' }}>Anomaly Score</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(acc => (
            <tr 
              key={acc.id} 
              // NEW: Update the state when a row is clicked
              onClick={() => setSelectedAccount(acc.id)}
              style={{ 
                borderBottom: '1px solid #334155', 
                cursor: 'pointer',
                // Highlight the row if it is currently selected
                background: selectedAccount === acc.id ? '#334155' : 'transparent' 
              }}
            >
              {/* Show only the first 8 characters of the ID in the table */}
              <td style={{ padding: '15px', fontFamily: 'monospace' }}>{acc.id.substring(0, 8)}</td>
              <td style={{ padding: '15px' }}>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  background: getBadgeColor(acc.anomaly_score),
                  color: acc.anomaly_score >= 0.4 && acc.anomaly_score <= 0.7 ? '#000' : '#fff'
                }}>
                  {acc.anomaly_score.toFixed(4)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* NEW: The GraphViz rendering area below the table */}
      <div style={{ marginTop: '40px', padding: '20px', borderRadius: '12px', background: '#1e293b', border: '1px solid #334155' }}>
        {selectedAccount ? (
          <div>
            <h3 style={{ marginTop: 0, marginBottom: '20px', color: 'white' }}>
              Investigating Account: <span style={{fontFamily: 'monospace'}}>{selectedAccount.substring(0, 8)}</span>
            </h3>
            <GraphViz accountId={selectedAccount} />
          </div>
        ) : (
          <p style={{ color: '#94a3b8' }}>Click an account in the table above to view its risk graph.</p>
        )}
      </div>

    </div>
  );
};

export default RiskTable;