/**
 * KYCMismatch.jsx
 * ----------------
 * KYC Behaviour Mismatch Engine — Task 19.
 * Detects accounts whose transactional behaviour deviates from their KYC
 * peer group. Displays results from 5 sub-detectors.
 */

import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

// ─── Copy button ──────────────────────────────────────────────────────────────

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

// ─── StatCard ─────────────────────────────────────────────────────────────────

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

// ─── Risk badge ───────────────────────────────────────────────────────────────

function RiskBadge({ level }) {
  const styles = {
    CRITICAL: { bg: "#FEF2F2", text: "#EF4444", border: "#FEE2E2" },
    HIGH:     { bg: "#FFF7ED", text: "#F97316", border: "#FFEDD5" },
    MEDIUM:   { bg: "#FEFCE8", text: "#EAB308", border: "#FEF9C3" },
    LOW:      { bg: "#F0FDFA", text: "#01B8AA", border: "#CCF5F2" },
  };
  const s = styles[level] || styles.LOW;
  return (
    <span
      style={{
        background: s.bg,
        color: s.text,
        border: `1px solid ${s.border}`,
        padding: "4px 10px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      {level}
    </span>
  );
}

// ─── Trigger chip ─────────────────────────────────────────────────────────────

function TriggerChip({ active, label, color }) {
  if (!active) return null;
  return (
    <span
      style={{
        background: `${color}15`, // very light bg
        color: color,
        border: `1px solid ${color}40`,
        padding: "3px 9px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        marginRight: 6,
        marginBottom: 6,
        display: "inline-block",
      }}
    >
      {label}
    </span>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function formatCurrency(val) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(val);
}

// ─── Progress Bar Helper ──────────────────────────────────────────────────────

function ScoreBar({ label, score, color }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 13, color: color, fontWeight: 700 }}>{(score * 100).toFixed(1)}%</span>
      </div>
      <div style={{ height: 6, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, score * 100)}%`, background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export default function KYCMismatch() {
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [data, setData]                   = useState([]);
  const [expandedAccount, setExpanded]    = useState(null);
  const [limit, setLimit]                 = useState(50);
  const [pendingLimit, setPendingLimit]   = useState(50);

  const fetchData = (fetchLimit) => {
    setLoading(true);
    setError(null);
    const config = { headers: { "ngrok-skip-browser-warning": "true" } };
    api
      .get(`/api/graph/kyc-mismatches?limit=${fetchLimit}`, config)
      .then((res) => {
        setData(Array.isArray(res.data) ? res.data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("KYC Mismatch fetch failed:", err);
        setError("Failed to load KYC mismatch data. Make sure the backend server is running.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData(limit);
  }, []);

  // ── KPI derivations ────────────────────────────────────────────────────────
  const totalFlagged  = data.length;
  const criticalCount = data.filter((d) => d.risk_level === "CRITICAL").length;
  const mahalCount    = data.filter((d) => (d.triggers || []).includes("mahalanobis")).length;
  const gnnBoosted    = data.filter((d) => d.gnn_boosted).length;

  const applyFilter = () => {
    setLimit(pendingLimit);
    setExpanded(null);
    fetchData(pendingLimit);
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", color: "#0F172A" }}>
      <Navbar />
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "40px 48px" }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
          <div>
            <h1
              style={{
                fontSize: 38,
                fontWeight: 800,
                background: "linear-gradient(135deg, #0284C7, #0EA5E9)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              KYC Behaviour Mismatch
            </h1>
            <p style={{ color: "#64748B", fontSize: 15, fontWeight: 500, marginTop: 8, marginBottom: 0 }}>
              Detects accounts whose transactional behaviour deviates significantly from their dynamically clustered peer group.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>
              Limit results:
            </label>
            <input
              type="number"
              min={10}
              max={200}
              value={pendingLimit}
              onChange={(e) => setPendingLimit(parseInt(e.target.value, 10) || 50)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              style={{
                width: 72,
                padding: "8px 10px",
                border: "1px solid #CBD5E1",
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                color: "#0F172A",
                outline: "none",
              }}
            />
            <button
              onClick={applyFilter}
              style={{
                background: "linear-gradient(135deg, #0284C7, #0EA5E9)",
                color: "#FFFFFF",
                border: "none",
                padding: "9px 18px",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                transition: "opacity 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Apply
            </button>
          </div>
        </div>

        {/* ── Loading ────────────────────────────────────────────────────── */}
        {loading && (
          <div style={{ textAlign: "center", padding: "100px 0" }}>
            <div
              style={{
                width: 40,
                height: 40,
                border: "4px solid #E2E8F0",
                borderTop: "4px solid #0EA5E9",
                borderRadius: "50%",
                animation: "spin-loader 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <span style={{ fontSize: 15, color: "#64748B", fontWeight: 600 }}>
              Analysing peer-group behaviour...
            </span>
          </div>
        )}

        {/* ── Error ─────────────────────────────────────────────────────── */}
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
              onClick={() => fetchData(limit)}
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

        {/* ── Content ────────────────────────────────────────────────────── */}
        {!loading && !error && (
          <>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 40 }}>
              <StatCard
                label="Accounts Flagged"
                value={totalFlagged}
                color="#0EA5E9"
                description={`Behaviour highly anomalous vs peers`}
              />
              <StatCard
                label="Critical Mismatches"
                value={criticalCount}
                color="#EF4444"
                description="Composite risk score > 0.8"
              />
              <StatCard
                label="Mahalanobis Exceptions"
                value={mahalCount}
                color="#F59E0B"
                description="Correlated feature distribution anomalies"
              />
              <StatCard
                label="GNN-Boosted"
                value={gnnBoosted}
                color="#8B5CF6"
                description="GraphSAGE structural agreement"
              />
            </div>

            {/* Table */}
            <div
              style={{
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                borderRadius: 16,
                boxShadow: "0 2px 10px rgba(0,0,0,0.01)",
                overflow: "hidden",
              }}
            >
              {/* Table header */}
              <div style={{ padding: "24px 32px", borderBottom: "1px solid #E2E8F0" }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: "#1E293B", margin: 0 }}>
                  Detected Outliers
                </h3>
                <p style={{ color: "#64748B", fontSize: 13, fontWeight: 500, marginTop: 4, marginBottom: 0 }}>
                  Accounts with behaviour scores exceeding normal variance for their assigned peer group.
                </p>
              </div>

              {data.length === 0 ? (
                <div style={{ padding: "60px 0", textAlign: "center", color: "#64748B", fontWeight: 600 }}>
                  No mismatches detected. Ensure the ML pipeline has run.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                        {[
                          "Account ID",
                          "Peer Group",
                          "Score / Risk",
                          "Trigger Signals",
                          "Actions",
                        ].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: "left",
                              fontSize: 11,
                              fontWeight: 700,
                              color: "#64748B",
                              padding: "14px 24px",
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((item, idx) => {
                        const isExpanded = expandedAccount === item.account_id;
                        const triggers = item.triggers || [];
                        return (
                          <React.Fragment key={idx}>
                            <tr
                              style={{
                                borderBottom: isExpanded ? "none" : "1px solid #E2E8F0",
                                background: isExpanded ? "#F8FAFC" : "transparent",
                                transition: "background 0.2s ease",
                              }}
                            >
                              {/* Account ID */}
                              <td style={{ padding: "18px 24px" }}>
                                <div style={{ display: "flex", alignItems: "center" }}>
                                  <span
                                    style={{
                                      fontFamily: "monospace",
                                      fontSize: 13,
                                      fontWeight: 700,
                                      color: "#0F172A",
                                    }}
                                  >
                                    {item.account_id}
                                  </span>
                                  <CopyButton text={item.account_id} />
                                </div>
                              </td>

                              {/* Peer Group */}
                              <td style={{ padding: "18px 24px" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <span style={{
                                    background: "#F1F5F9",
                                    color: "#475569",
                                    padding: "4px 10px",
                                    borderRadius: 6,
                                    fontWeight: 700,
                                    fontSize: 13,
                                    border: "1px solid #E2E8F0",
                                    width: "fit-content"
                                  }}>
                                    Group #{item.peer_group}
                                  </span>
                                  <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>
                                    {item.peer_group_name}
                                  </span>
                                </div>
                              </td>

                              {/* Risk level */}
                              <td style={{ padding: "18px 24px" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <RiskBadge level={item.risk_level} />
                                  <span style={{ fontSize: 12, color: "#1E293B", fontWeight: 700 }}>
                                    Score: {(item.composite_score * 100).toFixed(1)}
                                  </span>
                                </div>
                              </td>

                              {/* Flags */}
                              <td style={{ padding: "18px 24px", minWidth: 280 }}>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 0 }}>
                                  <TriggerChip active={triggers.includes("multi_dim_zscore")} label="Z-Score > 2.5σ" color="#0EA5E9" />
                                  <TriggerChip active={triggers.includes("mahalanobis")}      label="Mahalanobis" color="#F59E0B" />
                                  <TriggerChip active={triggers.includes("income_mismatch")}  label="Income Mismatch" color="#EF4444" />
                                  <TriggerChip active={triggers.includes("temporal_drift")}   label="Temporal Drift" color="#10B981" />
                                  <TriggerChip active={triggers.includes("gnn_agreement")}    label="GNN Boost" color="#8B5CF6" />
                                </div>
                              </td>

                              {/* Actions */}
                              <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => setExpanded(isExpanded ? null : item.account_id)}
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
                                  {isExpanded ? "Hide Detail" : "View Detail"}
                                </button>
                                <Link
                                  to={`/investigator?account=${item.account_id}`}
                                  style={{
                                    textDecoration: "none",
                                    display: "inline-block",
                                    background: "linear-gradient(135deg, #0284C7, #0EA5E9)",
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
                                    e.currentTarget.style.boxShadow = "0 3px 8px rgba(2,132,199,0.3)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = "scale(1)";
                                    e.currentTarget.style.boxShadow = "none";
                                  }}
                                >
                                  Investigate
                                </Link>
                              </td>
                            </tr>

                            {/* ── Expanded detail panel ──────────────────── */}
                            {isExpanded && (
                              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                                <td colSpan={5} style={{ padding: "0 24px 28px 24px" }}>
                                  <div
                                    style={{
                                      background: "#FFFFFF",
                                      border: "1px solid #E2E8F0",
                                      borderRadius: 12,
                                      padding: "20px 28px",
                                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
                                      display: "grid",
                                      gridTemplateColumns: "1fr 1fr",
                                      gap: 40,
                                    }}
                                  >
                                    {/* Column 1 — Sub-detectors */}
                                    <div>
                                      <h4 style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 0, marginBottom: 16 }}>
                                        Sub-Detector Scores
                                      </h4>
                                      <ScoreBar label="1. Multi-Dim Z-Score" score={item.zscore_score} color="#0EA5E9" />
                                      {item.deviant_dims && item.deviant_dims.length > 0 && (
                                        <div style={{ marginBottom: 12, marginLeft: 8, paddingLeft: 8, borderLeft: "2px solid #E2E8F0" }}>
                                          <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, marginBottom: 4 }}>DEVIANT DIMENSIONS</div>
                                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                            {item.deviant_dims.map((dim, i) => (
                                              <span key={i} style={{ fontSize: 11, background: "#F0F9FF", color: "#0284C7", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
                                                {dim}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      <ScoreBar label="2. Mahalanobis Distance" score={item.mahalanobis_score} color="#F59E0B" />
                                      <ScoreBar label="3. Income Mismatch" score={item.income_score} color="#EF4444" />
                                      <ScoreBar label="4. Temporal Drift" score={item.drift_score} color="#10B981" />
                                      
                                      <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px dashed #E2E8F0" }}>
                                        <ScoreBar label="5. GraphSAGE Probability" score={item.gnn_prob} color="#8B5CF6" />
                                      </div>
                                    </div>

                                    {/* Column 2 — Raw Stats */}
                                    <div>
                                      <h4 style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 0, marginBottom: 16 }}>
                                        Account Profile
                                      </h4>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                        <MetaRow label="Tx Outbound"       value={item.tx_count_out} />
                                        <MetaRow label="Tx Inbound"        value={item.tx_count_in} />
                                        <MetaRow label="Avg Amount Sent"   value={formatCurrency(item.avg_amount_sent)} />
                                        <MetaRow label="Avg Amount Recv"   value={formatCurrency(item.avg_amount_recv)} />
                                        <MetaRow label="Out-Degree"        value={item.out_degree} />
                                        <MetaRow label="In-Degree"         value={item.in_degree} />
                                        <MetaRow label="Active Days"       value={item.active_days} />
                                        <div style={{ padding: "8px 12px", background: "#FEF2F2", borderRadius: 6, border: "1px dashed #FCA5A5", marginTop: 8 }}>
                                          <MetaRow 
                                            label="Estimated Monthly Cap" 
                                            value={<span style={{ color: "#EF4444" }}>{formatCurrency(item.estimated_monthly_income)}</span>} 
                                          />
                                        </div>
                                      </div>
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

      <style>{`
        @keyframes spin-loader {
          0%   { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ─── Tiny helper sub-component ────────────────────────────────────────────────

function MetaRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 13, color: "#64748B", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#1E293B", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
