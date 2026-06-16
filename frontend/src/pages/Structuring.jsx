/**
 * Structuring.jsx
 * ---------------
 * Structuring Evasion Intelligence Detector.
 * Designed with a premium banking light-theme aesthetic, hover animations,
 * KPI metric counters, tabbed structuring patterns, and nested transaction details.
 */

import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const copy = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={copy}
      title="Copy account ID"
      style={{
        background: copied ? "#01B8AA" : "#F8FAFC",
        border: `1px solid ${copied ? "#01B8AA" : "#E2E8F0"}`,
        borderRadius: 6,
        padding: "4px 8px",
        cursor: "pointer",
        fontSize: 11,
        color: copied ? "#FFFFFF" : "#64748B",
        fontWeight: 600,
        marginLeft: 8,
        transition: "all 0.2s ease",
      }}
    >
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function StatCard({ label, value, color, description }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderLeft: `4px solid ${color}`,
        borderRadius: 14,
        boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
        transition: "transform 0.2s, box-shadow 0.2s",
        padding: "24px",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 16px rgba(0,0,0,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.02)";
      }}
    >
      <div style={{ color: "#64748B", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: color, lineHeight: 1.1, marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ color: "#94A3B8", fontSize: 11, fontWeight: 500 }}>
        {description}
      </div>
    </div>
  );
}

export default function Structuring() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({ threshold_structuring: [], fan_out_structuring: [] });
  const [activeTab, setActiveTab] = useState("threshold");
  const [expandedAccount, setExpandedAccount] = useState(null);

  useEffect(() => {
    const config = { headers: { "ngrok-skip-browser-warning": "true" } };
    api
      .get("/api/graph/structuring", config)
      .then((res) => {
        setData(res.data || { threshold_structuring: [], fan_out_structuring: [] });
        setLoading(false);
      })
      .catch((err) => {
        console.error("Structuring data fetch failed:", err);
        setError("Failed to load structuring cases. Make sure the backend server is running.");
        setLoading(false);
      });
  }, []);

  const formatAmount = (amt) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amt);
  };

  const getAnomalyBadge = (score) => {
    let bg = "#F0FDFA";
    let text = "#01B8AA";
    let border = "#CCF5F2";
    let label = "Low";

    if (score >= 0.8) {
      bg = "#FEF2F2";
      text = "#EF4444";
      border = "#FEE2E2";
      label = "CRITICAL";
    } else if (score >= 0.6) {
      bg = "#FFF7ED";
      text = "#F97316";
      border = "#FFEDD5";
      label = "HIGH";
    } else if (score >= 0.4) {
      bg = "#FEFCE8";
      text = "#EAB308";
      border = "#FEF9C3";
      label = "MEDIUM";
    }

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            background: bg,
            color: text,
            border: `1px solid ${border}`,
            padding: "4px 10px",
            borderRadius: 20,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B" }}>
          {score.toFixed(3)}
        </span>
      </div>
    );
  };

  const thresholdCount = data.threshold_structuring?.length || 0;
  const fanoutCount = data.fan_out_structuring?.length || 0;

  // Extract statistics
  const totalAccounts = new Set([
    ...(data.threshold_structuring?.map((c) => c.account_id) || []),
    ...(data.fan_out_structuring?.map((c) => c.account_id) || []),
  ]).size;

  const maxAmount = Math.max(
    0,
    ...(data.threshold_structuring?.map((c) => c.total_amount_structured) || []),
    ...(data.fan_out_structuring?.map((c) => c.total_amount_structured) || [])
  );

  const activeCases = activeTab === "threshold" ? data.threshold_structuring : data.fan_out_structuring;

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", color: "#0F172A" }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 48px" }}>
        
        {/* Header Section */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <h1
              style={{
                fontSize: 38,
                fontWeight: 800,
                background: "linear-gradient(135deg, #01B8AA, #0EA5E9)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Structuring Intelligence Detector
            </h1>
            <p style={{ color: "#64748B", fontSize: 15, fontWeight: 500, marginTop: 8, margin: 0 }}>
              Detect accounts slicing large funds just below regulatory limits (₹50k threshold) or deploying fan-out distributions.
            </p>
          </div>
          <span
            style={{
              fontSize: 11,
              background: "#FFFBEB",
              border: "1px solid #F59E0B",
              color: "#D97706",
              padding: "6px 14px",
              borderRadius: 30,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 2px 6px rgba(245, 158, 11, 0.1)",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#F59E0B",
                display: "inline-block",
                animation: "pulse-orange 1.5s infinite",
              }}
            />
            MONITORING TRANSACTION TRAFFIC
          </span>
        </div>

        {/* Loading / Error States */}
        {loading && (
          <div style={{ textAlign: "center", padding: "100px 0" }}>
            <div
              style={{
                width: 40,
                height: 40,
                border: "4px solid #E2E8F0",
                borderTop: "4px solid #01B8AA",
                borderRadius: "50%",
                animation: "spin-loader 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <span style={{ fontSize: 15, color: "#64748B", fontWeight: 600 }}>Analyzing transaction database...</span>
          </div>
        )}

        {error && !loading && (
          <div
            style={{
              background: "#FEF2F2",
              border: "1px solid #FEE2E2",
              borderRadius: 16,
              padding: "24px 32px",
              color: "#EF4444",
              fontWeight: 600,
              display: "flex",
              flexDirection: "column",
              gap: 12,
              alignItems: "center",
              textAlign: "center",
              margin: "40px 0",
            }}
          >
            <span style={{ fontSize: 24 }}>⚠️</span>
            <span style={{ fontSize: 16 }}>{error}</span>
            <button
              onClick={() => {
                setLoading(true);
                setError(null);
                api.get("/api/graph/structuring").then((res) => {
                  setData(res.data);
                  setLoading(false);
                }).catch(err => {
                  setError("Failed to load structuring cases.");
                  setLoading(false);
                });
              }}
              style={{
                background: "#EF4444",
                color: "#FFFFFF",
                border: "none",
                padding: "8px 20px",
                borderRadius: 8,
                fontWeight: 700,
                cursor: "pointer",
                marginTop: 8,
              }}
            >
              Retry Connection
            </button>
          </div>
        )}

        {/* Content Deck */}
        {!loading && !error && (
          <>
            {/* Stats Summary Grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 40 }}>
              <StatCard
                label="Structuring Accounts"
                value={totalAccounts}
                color="#0EA5E9"
                description="Distinct accounts flagged across patterns"
              />
              <StatCard
                label="Threshold structuring"
                value={thresholdCount}
                color="#F59E0B"
                description="3+ txs in ₹40k-₹50k window within 24 hours"
              />
              <StatCard
                label="Fan-out structuring"
                value={fanoutCount}
                color="#8B5CF6"
                description="One sender splitting to 5+ destinations in 2h"
              />
              <StatCard
                label="Peak Amount Flagged"
                value={formatAmount(maxAmount)}
                color="#EF4444"
                description="Maximum funds layered in a single pattern case"
              />
            </div>

            {/* Tab Selector */}
            <div style={{ display: "flex", gap: 12, borderBottom: "2px solid #E2E8F0", paddingBottom: 16, marginBottom: 28 }}>
              <button
                onClick={() => {
                  setActiveTab("threshold");
                  setExpandedAccount(null);
                }}
                style={{
                  background: activeTab === "threshold" ? "#FEF9C3" : "transparent",
                  color: activeTab === "threshold" ? "#CA8A04" : "#64748B",
                  border: activeTab === "threshold" ? "1px solid #FEF08A" : "1px solid transparent",
                  padding: "10px 20px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                Threshold Structuring ({thresholdCount})
              </button>
              <button
                onClick={() => {
                  setActiveTab("fanout");
                  setExpandedAccount(null);
                }}
                style={{
                  background: activeTab === "fanout" ? "#F5F3FF" : "transparent",
                  color: activeTab === "fanout" ? "#7C3AED" : "#64748B",
                  border: activeTab === "fanout" ? "1px solid #DDD6FE" : "1px solid transparent",
                  padding: "10px 20px",
                  borderRadius: 10,
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                Fan-out Structuring ({fanoutCount})
              </button>
            </div>

            {/* Results Table Section */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                borderRadius: 16,
                boxShadow: "0 2px 10px rgba(0,0,0,0.01)",
                overflow: "hidden",
              }}
            >
              <div style={{ padding: "24px 32px", borderBottom: "1px solid #E2E8F0" }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "#1E293B", margin: 0 }}>
                  {activeTab === "threshold" ? "Regulatory Reporting Evaders" : "High-Density Split routing"}
                </h3>
                <p style={{ color: "#64748B", fontSize: 13, fontWeight: 500, marginTop: 4, margin: 0 }}>
                  {activeTab === "threshold"
                    ? "Identifies accounts placing repeated transactions in the ₹40,000–₹49,999 range within 24 hours to deliberately evade mandatory regulatory reporting."
                    : "Identifies accounts layer-routing capital by splitting it across 5+ unique recipient destinations within under 2 hours."}
                </p>
              </div>

              {activeCases.length === 0 ? (
                <div style={{ padding: "60px 0", textAlign: "center", color: "#64748B", fontWeight: 600 }}>
                  No active structuring cases flagged in the current dataset.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                        <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748B", padding: "14px 24px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Hashed Account ID</th>
                        <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748B", padding: "14px 24px", textTransform: "uppercase", letterSpacing: "0.05em" }}>IF Anomaly Score</th>
                        <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748B", padding: "14px 24px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Structured Volume</th>
                        <th style={{ textAlign: "left", fontSize: 11, fontWeight: 700, color: "#64748B", padding: "14px 24px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Rolling Time Window</th>
                        <th style={{ textAlign: "right", fontSize: 11, fontWeight: 700, color: "#64748B", padding: "14px 24px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeCases.map((c, idx) => {
                        const isExpanded = expandedAccount === c.account_id;
                        return (
                          <React.Fragment key={idx}>
                            <tr
                              style={{
                                borderBottom: isExpanded ? "none" : "1px solid #E2E8F0",
                                background: isExpanded ? "#F8FAFC" : "transparent",
                                transition: "background 0.2s ease",
                              }}
                            >
                              <td style={{ padding: "18px 24px" }}>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                  <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 700, color: "#0F172A" }}>
                                    {c.account_id}
                                  </span>
                                  <CopyButton text={c.account_id} />
                                </div>
                              </td>
                              <td style={{ padding: "18px 24px" }}>{getAnomalyBadge(c.anomaly_score)}</td>
                              <td style={{ padding: "18px 24px", fontSize: 14, fontWeight: 700, color: "#1E293B" }}>
                                {formatAmount(c.total_amount_structured)}
                              </td>
                              <td style={{ padding: "18px 24px", fontSize: 13, color: "#64748B", fontWeight: 500 }}>
                                {c.time_window}
                              </td>
                              <td style={{ padding: "18px 24px", textAlign: "right" }}>
                                <button
                                  onClick={() => setExpandedAccount(isExpanded ? null : c.account_id)}
                                  style={{
                                    background: isExpanded ? "#E2E8F0" : "#FFFFFF",
                                    color: "#1E293B",
                                    border: "1px solid #CBD5E1",
                                    padding: "8px 16px",
                                    borderRadius: 8,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    marginRight: 10,
                                    transition: "all 0.2s",
                                  }}
                                >
                                  {isExpanded ? "Hide Details" : "View Tx Timeline"}
                                </button>
                                <Link
                                  to={`/investigator?account=${c.account_id}`}
                                  style={{
                                    textDecoration: "none",
                                    display: "inline-block",
                                    background: "linear-gradient(135deg, #01B8AA, #0EA5E9)",
                                    color: "#FFFFFF",
                                    border: "none",
                                    padding: "8px 18px",
                                    borderRadius: 8,
                                    fontSize: 13,
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    transition: "transform 0.2s, box-shadow 0.2s",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = "scale(1.03)";
                                    e.currentTarget.style.boxShadow = "0 3px 8px rgba(1, 184, 170, 0.3)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = "scale(1)";
                                    e.currentTarget.style.boxShadow = "none";
                                  }}
                                >
                                  Trace Flows
                                </Link>
                              </td>
                            </tr>

                            {/* Nested transaction timeline for expanded row */}
                            {isExpanded && (
                              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                                <td colSpan="5" style={{ padding: "0 24px 28px 24px" }}>
                                  <div
                                    style={{
                                      background: "#FFFFFF",
                                      border: "1px solid #E2E8F0",
                                      borderRadius: 12,
                                      padding: "20px 24px",
                                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
                                    }}
                                  >
                                    <h4 style={{ fontSize: 13, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 0, marginBottom: 14 }}>
                                      Structuring Transaction Sequence ({c.transactions?.length || 0} Transactions)
                                    </h4>
                                    <div style={{ overflowX: "auto" }}>
                                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                        <thead>
                                          <tr style={{ borderBottom: "2px solid #F1F5F9" }}>
                                            <th style={{ textAlign: "left", fontSize: 11, color: "#94A3B8", padding: "8px 12px", textTransform: "uppercase" }}>Sender</th>
                                            <th style={{ textAlign: "left", fontSize: 11, color: "#94A3B8", padding: "8px 12px", textTransform: "uppercase" }}>Recipient</th>
                                            <th style={{ textAlign: "left", fontSize: 11, color: "#94A3B8", padding: "8px 12px", textTransform: "uppercase" }}>Amount</th>
                                            <th style={{ textAlign: "left", fontSize: 11, color: "#94A3B8", padding: "8px 12px", textTransform: "uppercase" }}>Timestamp</th>
                                            <th style={{ textAlign: "left", fontSize: 11, color: "#94A3B8", padding: "8px 12px", textTransform: "uppercase" }}>Format</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {c.transactions?.map((t, tIdx) => (
                                            <tr key={tIdx} style={{ borderBottom: "1px solid #F1F5F9" }}>
                                              <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: "#64748B" }}>
                                                {t.sender}
                                              </td>
                                              <td style={{ padding: "10px 12px", fontFamily: "monospace", fontSize: 13, color: "#0F172A", fontWeight: 600 }}>
                                                {t.receiver}
                                              </td>
                                              <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 700, color: activeTab === "threshold" ? "#CA8A04" : "#7C3AED" }}>
                                                {formatAmount(t.amount)}
                                              </td>
                                              <td style={{ padding: "10px 12px", fontSize: 13, color: "#64748B" }}>
                                                {t.timestamp}
                                              </td>
                                              <td style={{ padding: "10px 12px" }}>
                                                <span
                                                  style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    background: "#F8FAFC",
                                                    border: "1px solid #E2E8F0",
                                                    color: "#475569",
                                                    padding: "2px 8px",
                                                    borderRadius: 4,
                                                  }}
                                                >
                                                  {t.payment_format}
                                                </span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Global CSS Styles */}
      <style>{`
        @keyframes pulse-orange {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }
        @keyframes spin-loader {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
