/**
 * DormantAccounts.jsx
 * -------------------
 * Dormant Account Reactivation Detector — Task 18.
 * Identifies accounts inactive for 90+ days that suddenly reactivate,
 * a known money-mule onboarding pattern.
 *
 * Architecture: mirrors Structuring.jsx exactly.
 * - Same StatCard pattern (4 KPI cards)
 * - Same expandable-row table
 * - Same risk-badge color scheme (matches getAnomalyBadge())
 * - Same loading / error / retry states
 * - Same "Trace Flows" → /investigator?account=<id> link
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

// ─── Risk badge (mirrors getAnomalyBadge() from Structuring.jsx) ──────────────

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

// ─── Flag chip ────────────────────────────────────────────────────────────────

function FlagChip({ active, label }) {
  return (
    <span
      style={{
        background: active ? "#FEF2F2" : "#F8FAFC",
        color: active ? "#EF4444" : "#94A3B8",
        border: `1px solid ${active ? "#FEE2E2" : "#E2E8F0"}`,
        padding: "3px 9px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        marginRight: 6,
        display: "inline-block",
      }}
    >
      {active ? "🚩 " : ""}{label}
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

// ─── Main page component ──────────────────────────────────────────────────────

export default function DormantAccounts() {
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState(null);
  const [data, setData]                   = useState([]);
  const [expandedAccount, setExpanded]    = useState(null);
  const [minDays, setMinDays]             = useState(90);
  const [pendingDays, setPendingDays]     = useState(90);

  const fetchData = (days) => {
    setLoading(true);
    setError(null);
    const config = { headers: { "ngrok-skip-browser-warning": "true" } };
    api
      .get(`/api/graph/dormant-accounts?limit=50&min_dormant_days=${days}`, config)
      .then((res) => {
        setData(Array.isArray(res.data) ? res.data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Dormant accounts fetch failed:", err);
        setError("Failed to load dormant account data. Make sure the backend server is running.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData(minDays);
  }, []);

  // ── KPI derivations ────────────────────────────────────────────────────────
  const totalFlagged  = data.length;
  const muleCount     = data.filter((d) => d.mule_signature_flag).length;
  const criticalCount = data.filter((d) => d.risk_level === "CRITICAL").length;
  const avgDormancy   = totalFlagged > 0
    ? Math.round(data.reduce((s, d) => s + (d.days_dormant || 0), 0) / totalFlagged)
    : 0;

  const applyFilter = () => {
    setMinDays(pendingDays);
    setExpanded(null);
    fetchData(pendingDays);
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
                background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                margin: 0,
                lineHeight: 1.2,
              }}
            >
              Dormant Account Detector
            </h1>
            <p style={{ color: "#64748B", fontSize: 15, fontWeight: 500, marginTop: 8, marginBottom: 0 }}>
              Flags accounts inactive for {minDays}+ days that suddenly reactivate — a key money-mule onboarding signal.
            </p>
          </div>

          {/* Dormancy threshold control */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#475569", whiteSpace: "nowrap" }}>
              Min. dormancy:
            </label>
            <input
              type="number"
              min={7}
              max={730}
              value={pendingDays}
              onChange={(e) => setPendingDays(Math.max(7, parseInt(e.target.value, 10) || 90))}
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
            <span style={{ fontSize: 13, color: "#64748B", fontWeight: 500 }}>days</span>
            <button
              onClick={applyFilter}
              style={{
                background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
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

            <span
              style={{
                fontSize: 11,
                background: "#FDF4FF",
                border: "1px solid #E879F9",
                color: "#A21CAF",
                padding: "6px 14px",
                borderRadius: 30,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 2px 6px rgba(232,121,249,0.1)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#A21CAF",
                  display: "inline-block",
                  animation: "pulse-violet 1.5s infinite",
                }}
              />
              MONITORING REACTIVATION EVENTS
            </span>
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
                borderTop: "4px solid #8B5CF6",
                borderRadius: "50%",
                animation: "spin-loader 1s linear infinite",
                margin: "0 auto 16px",
              }}
            />
            <span style={{ fontSize: 15, color: "#64748B", fontWeight: 600 }}>
              Scanning for dormant account reactivations...
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
              onClick={() => fetchData(minDays)}
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
                label="Dormant Accounts Flagged"
                value={totalFlagged}
                color="#8B5CF6"
                description={`Accounts inactive ${minDays}+ days then reactivated`}
              />
              <StatCard
                label="Avg. Days Dormant"
                value={avgDormancy || "—"}
                color="#EC4899"
                description="Mean dormancy gap across all flagged accounts"
              />
              <StatCard
                label="Mule Signatures"
                value={muleCount}
                color="#EF4444"
                description="Fan-out ≥ 5 unique recipients in first 7 days"
              />
              <StatCard
                label="Critical Risk"
                value={criticalCount}
                color="#F59E0B"
                description="Accounts scored CRITICAL after reactivation"
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
                  Reactivated Dormant Accounts
                </h3>
                <p style={{ color: "#64748B", fontSize: 13, fontWeight: 500, marginTop: 4, marginBottom: 0 }}>
                  Accounts that lay inactive for {minDays}+ days and then showed sudden outbound transaction bursts —
                  a canonical money-mule account takeover pattern.
                </p>
              </div>

              {data.length === 0 ? (
                <div style={{ padding: "60px 0", textAlign: "center", color: "#64748B", fontWeight: 600 }}>
                  No dormant accounts with {minDays}+ day gaps found. Try lowering the threshold or running the transaction simulator.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                        {[
                          "Account ID",
                          "Days Dormant",
                          "Reactivation Date",
                          "7-Day Volume",
                          "Risk Level",
                          "Flags",
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

                              {/* Days dormant */}
                              <td style={{ padding: "18px 24px" }}>
                                <span
                                  style={{
                                    background: item.days_dormant >= 180 ? "#FEF2F2" : item.days_dormant >= 120 ? "#FFF7ED" : "#F0FDFA",
                                    color: item.days_dormant >= 180 ? "#EF4444" : item.days_dormant >= 120 ? "#F97316" : "#01B8AA",
                                    border: `1px solid ${item.days_dormant >= 180 ? "#FEE2E2" : item.days_dormant >= 120 ? "#FFEDD5" : "#CCF5F2"}`,
                                    padding: "4px 12px",
                                    borderRadius: 20,
                                    fontSize: 13,
                                    fontWeight: 700,
                                  }}
                                >
                                  {item.days_dormant}d
                                </span>
                              </td>

                              {/* Reactivation date */}
                              <td style={{ padding: "18px 24px", fontSize: 13, color: "#475569", fontWeight: 500 }}>
                                {item.reactivation_date || "—"}
                              </td>

                              {/* 7-day volume */}
                              <td style={{ padding: "18px 24px", fontSize: 14, fontWeight: 700, color: "#1E293B" }}>
                                {formatCurrency(item.transaction_volume_first_7_days)}
                                <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500, marginTop: 2 }}>
                                  {item.transaction_count_first_7_days} txs · {item.out_degree_first_7_days} recipients
                                </div>
                              </td>

                              {/* Risk level */}
                              <td style={{ padding: "18px 24px" }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                  <RiskBadge level={item.risk_level} />
                                  <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 500 }}>
                                    GNN: {(item.gnn_fraud_probability * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </td>

                              {/* Flags */}
                              <td style={{ padding: "18px 24px", whiteSpace: "nowrap" }}>
                                <FlagChip active={item.near_certain_mule}    label="Certain Mule" />
                                <FlagChip active={item.mule_signature_flag}  label="Mule Sig." />
                                <FlagChip active={item.rapid_fanout_flag}    label="Fan-Out" />
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
                                  {isExpanded ? "Hide Details" : "View Details"}
                                </button>
                                <Link
                                  to={`/investigator?account=${item.account_id}`}
                                  style={{
                                    textDecoration: "none",
                                    display: "inline-block",
                                    background: "linear-gradient(135deg, #8B5CF6, #EC4899)",
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
                                    e.currentTarget.style.boxShadow = "0 3px 8px rgba(139,92,246,0.3)";
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

                            {/* ── Expanded detail panel ──────────────────── */}
                            {isExpanded && (
                              <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                                <td colSpan={7} style={{ padding: "0 24px 28px 24px" }}>
                                  <div
                                    style={{
                                      background: "#FFFFFF",
                                      border: "1px solid #E2E8F0",
                                      borderRadius: 12,
                                      padding: "20px 28px",
                                      boxShadow: "inset 0 2px 4px rgba(0,0,0,0.02)",
                                      display: "grid",
                                      gridTemplateColumns: "repeat(3, 1fr)",
                                      gap: 24,
                                    }}
                                  >
                                    {/* Column 1 — Dormancy metrics */}
                                    <div>
                                      <h4 style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 0, marginBottom: 12 }}>
                                        Dormancy Details
                                      </h4>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        <MetaRow label="Days Dormant"      value={`${item.days_dormant} days`} />
                                        <MetaRow label="Reactivation Date" value={item.reactivation_date || "—"} />
                                      </div>
                                    </div>

                                    {/* Column 2 — 7-day window stats */}
                                    <div>
                                      <h4 style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 0, marginBottom: 12 }}>
                                        First-7-Days Window
                                      </h4>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        <MetaRow label="Volume"            value={formatCurrency(item.transaction_volume_first_7_days)} />
                                        <MetaRow label="Transaction Count" value={item.transaction_count_first_7_days} />
                                        <MetaRow label="Out-Degree"        value={item.out_degree_first_7_days} />
                                        <MetaRow label="Unique Recipients" value={item.unique_destinations_first_7_days} />
                                      </div>
                                    </div>

                                    {/* Column 3 — Risk scores */}
                                    <div>
                                      <h4 style={{ fontSize: 12, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 0, marginBottom: 12 }}>
                                        Risk Intelligence
                                      </h4>
                                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>

                                        {/* GNN score */}
                                        <div>
                                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>GNN Fraud Prob. (60%)</span>
                                            <span style={{ fontSize: 13, color: "#8B5CF6", fontWeight: 700 }}>{((item.gnn_fraud_probability ?? 0) * 100).toFixed(2)}%</span>
                                          </div>
                                          <div style={{ height: 5, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                                            <div style={{ height: "100%", width: `${(item.gnn_fraud_probability ?? 0) * 100}%`, background: "linear-gradient(90deg, #8B5CF6, #A78BFA)", borderRadius: 4, transition: "width 0.5s ease" }} />
                                          </div>
                                        </div>

                                        {/* Propagated risk */}
                                        <div>
                                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>Propagated Graph Risk (40%)</span>
                                            <span style={{ fontSize: 13, color: "#EC4899", fontWeight: 700 }}>{((item.propagated_risk_score ?? 0) * 100).toFixed(2)}%</span>
                                          </div>
                                          <div style={{ height: 5, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                                            <div style={{ height: "100%", width: `${(item.propagated_risk_score ?? 0) * 100}%`, background: "linear-gradient(90deg, #EC4899, #F9A8D4)", borderRadius: 4, transition: "width 0.5s ease" }} />
                                          </div>
                                        </div>

                                        {/* Combined score with formula breakdown */}
                                        <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 10 }}>
                                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, color: "#475569", fontWeight: 700 }}>Combined Risk Score</span>
                                            <span style={{ fontSize: 14, fontWeight: 800, color:
                                              (item.combined_risk_score ?? 0) >= 0.8 ? "#EF4444" :
                                              (item.combined_risk_score ?? 0) >= 0.6 ? "#F97316" :
                                              (item.combined_risk_score ?? 0) >= 0.4 ? "#EAB308" : "#01B8AA"
                                            }}>
                                              {((item.combined_risk_score ?? 0) * 100).toFixed(2)}%
                                            </span>
                                          </div>
                                          <div style={{ height: 7, background: "#F1F5F9", borderRadius: 4, overflow: "hidden" }}>
                                            <div style={{
                                              height: "100%",
                                              width: `${(item.combined_risk_score ?? 0) * 100}%`,
                                              background:
                                                (item.combined_risk_score ?? 0) >= 0.8 ? "linear-gradient(90deg, #EF4444, #FCA5A5)" :
                                                (item.combined_risk_score ?? 0) >= 0.6 ? "linear-gradient(90deg, #F97316, #FDBA74)" :
                                                (item.combined_risk_score ?? 0) >= 0.4 ? "linear-gradient(90deg, #EAB308, #FDE047)" :
                                                "linear-gradient(90deg, #01B8AA, #5EEAD4)",
                                              borderRadius: 4,
                                              transition: "width 0.5s ease",
                                            }} />
                                          </div>
                                          <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 5, fontStyle: "italic" }}>
                                            0.6 × GNN + 0.4 × Propagated
                                            {item.mule_signature_flag ? " + 0.15 mule boost" : item.rapid_fanout_flag ? " + 0.05 fan-out boost" : ""}
                                          </div>
                                        </div>

                                        {/* Flags */}
                                        <div style={{ borderTop: "1px solid #E2E8F0", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                                          <MetaRow label="Risk Level" value={<RiskBadge level={item.risk_level} />} />
                                          <MetaRow
                                            label="Near-Certain Mule"
                                            value={
                                              <span style={{ color: item.near_certain_mule ? "#EF4444" : "#01B8AA", fontWeight: 700, fontSize: 13 }}>
                                                {item.near_certain_mule ? "⚠ YES" : "✓ No"}
                                              </span>
                                            }
                                          />
                                          <MetaRow
                                            label="Mule Signature"
                                            value={
                                              <span style={{ color: item.mule_signature_flag ? "#EF4444" : "#01B8AA", fontWeight: 700, fontSize: 13 }}>
                                                {item.mule_signature_flag ? "⚠ YES" : "✓ No"}
                                              </span>
                                            }
                                          />
                                          <MetaRow
                                            label="Rapid Fan-Out"
                                            value={
                                              <span style={{ color: item.rapid_fanout_flag ? "#F97316" : "#01B8AA", fontWeight: 700, fontSize: 13 }}>
                                                {item.rapid_fanout_flag ? "⚠ YES" : "✓ No"}
                                              </span>
                                            }
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

      {/* Global keyframes */}
      <style>{`
        @keyframes pulse-violet {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.9); }
        }
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
      <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 13, color: "#1E293B", fontWeight: 600 }}>{value}</span>
    </div>
  );
}
