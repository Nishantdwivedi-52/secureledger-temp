import React, { useState, useEffect } from 'react';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis,
  BarChart, Bar
} from 'recharts';

export default function AccountTimeline({ accountId, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accountId) return;
    
    setLoading(true);
    fetch(`http://localhost:8000/api/account/${accountId}/timeline`)
      .then(res => {
        if (!res.ok) throw new Error("Failed to fetch timeline");
        return res.json();
      })
      .then(json => {
        // Process data for charts
        const scatterData = { green: [], amber: [], red: [] };
        const dailyVolume = {};

        json.forEach(tx => {
          const date = new Date(tx.timestamp);
          const timeMs = date.getTime();
          const dayStr = date.toISOString().split('T')[0];

          // 1. Scatter data
          const point = {
            ...tx,
            timeMs,
            logAmount: Math.max(1, tx.amount),
            dateStr: date.toLocaleString()
          };
          
          if (tx.point_color === 'red') scatterData.red.push(point);
          else if (tx.point_color === 'amber') scatterData.amber.push(point);
          else scatterData.green.push(point);

          // 2. Bar data (daily aggregate)
          if (!dailyVolume[dayStr]) {
            dailyVolume[dayStr] = {
              dayStr,
              timeMs: new Date(dayStr).getTime(),
              count: 0,
              totalAmount: 0
            };
          }
          dailyVolume[dayStr].count += 1;
          dailyVolume[dayStr].totalAmount += tx.amount;
        });

        // Sort bar data by time
        const barData = Object.values(dailyVolume).sort((a, b) => a.timeMs - b.timeMs);

        setData({ scatterData, barData, raw: json });
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err.message);
        setLoading(false);
      });
  }, [accountId]);

  // Custom Tooltip for ScatterChart
  const CustomScatterTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const tx = payload[0].payload;
      return (
        <div style={{ background: '#fff', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
          <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '8px' }}>{tx.dateStr}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ fontWeight: 600, color: '#0F172A' }}>{tx.direction === 'OUT' ? 'To: ' : 'From: '}</span>
            <span style={{ fontFamily: 'monospace', color: '#334155' }}>{tx.counterparty.substring(0, 8)}...</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span style={{ color: '#64748B' }}>Amount:</span>
            <span style={{ fontWeight: 700, color: '#0F172A' }}>₹{tx.amount.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: '#64748B' }}>Channel:</span>
            <span style={{ color: '#0F172A' }}>{tx.channel}</span>
          </div>
          
          {(tx.point_color === 'red' || tx.point_color === 'amber') && (
            <div style={{ 
              marginTop: '8px', 
              paddingTop: '8px', 
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              gap: '4px'
            }}>
              {tx.point_color === 'red' && (
                <span style={{ background: '#FEE2E2', color: '#DC2626', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>GNN Flag</span>
              )}
              {tx.point_color === 'amber' && (
                <span style={{ background: '#FEF3C7', color: '#D97706', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>Anomaly Flag</span>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  const dateFormatter = (timeMs) => {
    return new Date(timeMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const amountFormatter = (val) => {
    if (val >= 10000000) return `₹${(val/10000000).toFixed(1)}Cr`;
    if (val >= 100000) return `₹${(val/100000).toFixed(1)}L`;
    if (val >= 1000) return `₹${(val/1000).toFixed(1)}k`;
    return `₹${val}`;
  };

  return (
    <>
      {/* Backdrop overlay */}
      <div 
        style={{
          position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', zIndex: 9998,
          backdropFilter: 'blur(2px)'
        }}
        onClick={onClose}
      />
      
      {/* Sliding Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: '420px',
        background: '#fff', zIndex: 9999, boxShadow: '-4px 0 15px rgba(0,0,0,0.1)',
        display: 'flex', flexDirection: 'column',
        transform: 'translateX(0)', transition: 'transform 0.25s ease',
        overflowY: 'auto'
      }}>
        {/* Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#0F172A' }}>Transaction Timeline</h2>
            <div style={{ fontSize: '13px', color: '#64748B', marginTop: '4px', fontFamily: 'monospace' }}>{accountId}</div>
          </div>
          <button 
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#64748B', padding: '4px' }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>Loading timeline...</div>
          ) : error ? (
            <div style={{ background: '#FEE2E2', color: '#DC2626', padding: '16px', borderRadius: '8px' }}>{error}</div>
          ) : data && data.raw.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#64748B' }}>No transactions found for this account.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
              
              {/* Scatter Chart (Individual Transactions) */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>Individual Transactions</h3>
                <div style={{ height: '280px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis 
                        dataKey="timeMs" 
                        type="number" 
                        domain={['dataMin', 'dataMax']} 
                        tickFormatter={dateFormatter}
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        tickLine={false}
                        axisLine={{ stroke: '#E2E8F0' }}
                        scale="time"
                      />
                      <YAxis 
                        dataKey="amount" 
                        type="number" 
                        scale="log" 
                        domain={['auto', 'auto']}
                        tickFormatter={amountFormatter}
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        tickLine={false}
                        axisLine={false}
                        width={50}
                      />
                      <ZAxis range={[30, 30]} /> {/* Fixed dot size */}
                      <Tooltip content={<CustomScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                      
                      <Scatter name="Normal" data={data.scatterData.green} fill="#10B981" fillOpacity={0.6} />
                      <Scatter name="Anomalous" data={data.scatterData.amber} fill="#F59E0B" fillOpacity={0.8} />
                      <Scatter name="GNN Flagged" data={data.scatterData.red} fill="#EF4444" fillOpacity={0.9} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bar Chart (Daily Volume) */}
              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#334155', marginBottom: '16px' }}>Daily Transaction Count</h3>
                <div style={{ height: '180px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.barData} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                      <XAxis 
                        dataKey="timeMs" 
                        type="number" 
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={dateFormatter}
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        tickLine={false}
                        axisLine={{ stroke: '#E2E8F0' }}
                        scale="time"
                      />
                      <YAxis 
                        tick={{ fontSize: 11, fill: '#64748B' }}
                        tickLine={false}
                        axisLine={false}
                        width={30}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        cursor={{ fill: '#F1F5F9' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                        labelFormatter={dateFormatter}
                        formatter={(val) => [val, 'Transactions']}
                      />
                      <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              
              <div style={{ background: '#F8FAFC', padding: '16px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                <div style={{ fontSize: '13px', color: '#475569', display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span>Total Transactions:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{data?.raw?.length || 0}</span>
                </div>
                <div style={{ fontSize: '13px', color: '#475569', display: 'flex', justifyContent: 'space-between' }}>
                  <span>High Risk (Red/Amber):</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>
                    {(data?.scatterData?.red?.length || 0) + (data?.scatterData?.amber?.length || 0)}
                  </span>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
