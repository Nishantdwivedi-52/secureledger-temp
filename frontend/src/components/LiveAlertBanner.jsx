/**
 * LiveAlertBanner.jsx
 * --------------------
 * Connects to the FastAPI WebSocket endpoint and displays a
 * sliding alert banner at the top of the page whenever a new
 * transaction is detected.
 *
 * Mount once in Investigator.jsx — it manages its own WS lifecycle.
 */

import { useEffect, useRef, useState } from "react";

const WS_URL   = "ws://127.0.0.1:8000/ws/live-transactions";
const MAX_QUEUE = 5;   // maximum stacked alerts shown at once

// ─── alert level style map ────────────────────────────────────────────────────
const LEVEL_STYLES = {
  CRITICAL: {
    background: "linear-gradient(135deg, #450a0a, #7f1d1d)",
    border:     "#ef4444",
    icon:       "🚨",
    labelColor: "#fca5a5",
  },
  WARNING: {
    background: "linear-gradient(135deg, #431407, #78350f)",
    border:     "#f97316",
    icon:       "⚠️",
    labelColor: "#fdba74",
  },
  INFO: {
    background: "linear-gradient(135deg, #052e16, #14532d)",
    border:     "#22c55e",
    icon:       "✅",
    labelColor: "#86efac",
  },
};

function AlertCard({ event, onDismiss }) {
  const style = LEVEL_STYLES[event.alert_level] ?? LEVEL_STYLES.INFO;

  return (
    <div style={{
      background: style.background,
      border:     `1px solid ${style.border}`,
      borderRadius: 12,
      padding:    "14px 18px",
      marginBottom: 8,
      display:    "flex",
      alignItems: "flex-start",
      gap:        14,
      boxShadow:  `0 0 20px ${style.border}30`,
      animation:  "slideIn 0.3s ease-out",
      position:   "relative",
    }}>
      {/* Icon */}
      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{style.icon}</span>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Level badge + timestamp */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{
            fontSize: 10, fontWeight: 800,
            color: style.labelColor,
            letterSpacing: "0.1em",
          }}>
            {event.alert_level}
          </span>
          <span style={{ fontSize: 10, color: "#475569" }}>
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
          {event.fraud === 1 && (
            <span style={{
              background: "#7f1d1d",
              border: "1px solid #ef4444",
              color: "#fca5a5",
              fontSize: 9,
              fontWeight: 700,
              padding: "1px 7px",
              borderRadius: 9999,
            }}>
              FRAUD FLAGGED 🚩
            </span>
          )}
        </div>

        {/* Transaction summary */}
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          {[
            { label: "FROM",   value: (event.from_acc ?? "—").slice(0, 12) + "…", mono: true },
            { label: "TO",     value: (event.to_acc   ?? "—").slice(0, 12) + "…", mono: true },
            { label: "AMOUNT", value: `$${Number(event.amount ?? 0).toLocaleString()}`,        color: "#fbbf24" },
            { label: "FORMAT", value: event.payment_format ?? "WIRE"                                            },
          ].map(({ label, value, mono, color }) => (
            <div key={label}>
              <div style={{ fontSize: 9, color: "#475569", marginBottom: 2 }}>{label}</div>
              <div style={{
                fontSize: 12, fontWeight: 700,
                fontFamily: mono ? "monospace" : "inherit",
                color: color ?? "#e2e8f0",
              }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Risk delta row */}
        {event.risk_delta && (
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            {["from", "to"].map(side => {
              const delta = event.risk_delta[side] ?? 0;
              const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "─";
              const col   = delta > 0 ? "#ef4444" : "#22c55e";
              return (
                <div key={side} style={{ fontSize: 11, color: "#64748b" }}>
                  Risk {side.toUpperCase()}:{" "}
                  <span style={{ color: col, fontWeight: 700 }}>
                    {arrow} {Math.abs(delta).toFixed(4)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        style={{
          background: "none", border: "none",
          color: "#475569", cursor: "pointer",
          fontSize: 16, lineHeight: 1, flexShrink: 0,
          padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── connection status pill ───────────────────────────────────────────────────

function StatusPill({ status }) {
  const map = {
    connected:    { color: "#22c55e", label: "LIVE STREAM" },
    connecting:   { color: "#eab308", label: "CONNECTING…" },
    disconnected: { color: "#ef4444", label: "DISCONNECTED" },
  };
  const s = map[status] ?? map.disconnected;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: "#0f172a",
      border: `1px solid ${s.color}30`,
      borderRadius: 9999,
      padding: "4px 12px",
      fontSize: 11, fontWeight: 700, color: s.color,
      marginBottom: 8,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: "50%",
        background: s.color,
        boxShadow: status === "connected" ? `0 0 6px ${s.color}` : "none",
        animation: status === "connected" ? "pulse 2s infinite" : "none",
        display: "inline-block",
      }} />
      {s.label}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function LiveAlertBanner() {
  const [alerts,  setAlerts]  = useState([]);
  const [status,  setStatus]  = useState("connecting");
  const [total,   setTotal]   = useState(0);   // lifetime count this session
  const wsRef = useRef(null);
  const pingRef = useRef(null);

  useEffect(() => {
    let retryTimeout = null;

    function connect() {
      setStatus("connecting");
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus("connected");
        // Keep-alive ping every 20s
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 20_000);
      };

      ws.onmessage = (evt) => {
        // FIXED: Ignore plain text ping/pong messages to prevent JSON parse errors
        if (evt.data === "pong" || evt.data === "ping") return;

        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === "heartbeat") return;

          if (msg.type === "history") {
            // Replay recent events for context — show last 3
            const recent = (msg.events ?? []).slice(-3);
            setAlerts(recent.map((e, i) => ({ ...e, _id: `hist_${i}` })));
            return;
          }

          if (msg.type === "transaction") {
            setTotal(t => t + 1);
            const alert = { ...msg, _id: `${Date.now()}_${Math.random()}` };
            setAlerts(prev => [alert, ...prev].slice(0, MAX_QUEUE));

            // Auto-dismiss non-critical alerts after 8s
            if (msg.alert_level !== "CRITICAL") {
              setTimeout(() => {
                setAlerts(prev => prev.filter(a => a._id !== alert._id));
              }, 8_000);
            }
          }
        } catch (e) {
          console.warn("WS parse error:", e);
        }
      };

      ws.onclose = () => {
        setStatus("disconnected");
        clearInterval(pingRef.current);
        // Reconnect after 5s
        retryTimeout = setTimeout(connect, 5_000);
      };

      ws.onerror = () => {
        setStatus("disconnected");
        ws.close();
      };
    }

    connect();

    return () => {
      clearTimeout(retryTimeout);
      clearInterval(pingRef.current);
      wsRef.current?.close();
    };
  }, []);

  const dismiss = (id) => setAlerts(prev => prev.filter(a => a._id !== id));

  if (alerts.length === 0 && status === "connected") {
    // Quiet state — just show the status pill
    return (
      <div style={{ marginBottom: 16 }}>
        <StatusPill status={status} />
        <span style={{ fontSize: 12, color: "#334155", marginLeft: 8 }}>
          Watching for live transactions…  ({total} received this session)
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Status row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <StatusPill status={status} />
        {total > 0 && (
          <span style={{ fontSize: 12, color: "#475569" }}>
            {total} transaction{total !== 1 ? "s" : ""} detected this session
          </span>
        )}
        {alerts.length > 0 && (
          <button
            onClick={() => setAlerts([])}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "1px solid #334155",
              color: "#64748b",
              padding: "4px 12px",
              borderRadius: 8,
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Alert cards */}
      {alerts.map(alert => (
        <AlertCard
          key={alert._id}
          event={alert}
          onDismiss={() => dismiss(alert._id)}
        />
      ))}

      <style>{`
        @keyframes slideIn {
          from { opacity:0; transform:translateY(-12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes pulse {
          0%,100% { opacity:1; }
          50%      { opacity:0.3; }
        }
      `}</style>
    </div>
  );
}