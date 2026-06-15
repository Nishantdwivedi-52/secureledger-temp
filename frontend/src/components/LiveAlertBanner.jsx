/**
 * LiveAlertBanner.jsx
 * --------------------
 * Connects to the FastAPI WebSocket endpoint and displays a
 * sliding alert banner at the top of the page whenever a new
 * transaction is detected.
 * Light Theme Edition.
 */

import { useEffect, useRef, useState } from "react";

const WS_URL   = "ws://127.0.0.1:8000/ws/live-transactions";
const MAX_QUEUE = 5;

const LEVEL_STYLES = {
  CRITICAL: {
    background: "#FFF5F5",
    border:     "#FD625E",
    icon:       <div style={{width:10,height:10,backgroundColor:"#FD625E",borderRadius:"50%"}}/>,
    labelColor: "#FD625E",
  },
  WARNING: {
    background: "#FFFBEB",
    border:     "#F2C80F",
    icon:       <div style={{width:10,height:10,backgroundColor:"#F2C80F",borderRadius:"50%"}}/>,
    labelColor: "#D97706",
  },
  INFO: {
    background: "#F0FDF9",
    border:     "#01B8AA",
    icon:       <div style={{width:10,height:10,backgroundColor:"#01B8AA",borderRadius:"50%"}}/>,
    labelColor: "#01B8AA",
  },
};

function AlertCard({ event, onDismiss }) {
  const style = LEVEL_STYLES[event.alert_level] ?? LEVEL_STYLES.INFO;

  return (
    <div style={{
      background: style.background,
      border:     `1px solid ${style.border}`,
      borderLeft: `4px solid ${style.border}`,
      borderRadius: 12,
      padding:    "14px 20px",
      marginBottom: 10,
      display:    "flex",
      alignItems: "flex-start",
      gap:        14,
      boxShadow:  "0 2px 8px rgba(0,0,0,0.04)",
      animation:  "slideIn 0.3s ease-out",
      position:   "relative",
    }}>
      {/* Icon */}
      <div style={{ marginTop: 4, flexShrink: 0 }}>
        {style.icon}
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Level badge + timestamp */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 800,
            color: style.labelColor,
            letterSpacing: "0.1em",
          }}>
            {event.alert_level}
          </span>
          <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>
            {new Date(event.timestamp).toLocaleTimeString()}
          </span>
          {event.fraud === 1 && (
            <span style={{
              background: "#FFF5F5",
              border: "1px solid #FD625E",
              color: "#FD625E",
              fontSize: 10,
              fontWeight: 800,
              padding: "2px 8px",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: 6
            }}>
              FRAUD FLAGGED
              <div style={{width:10,height:10,backgroundColor:"#FD625E",borderRadius:2}}/>
            </span>
          )}
        </div>

        {/* Transaction summary */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
          {[
            { label: "FROM",   value: (event.from_acc ?? "—").slice(0, 12) + "…", mono: true },
            { label: "TO",     value: (event.to_acc   ?? "—").slice(0, 12) + "…", mono: true },
            { label: "AMOUNT", value: `$${Number(event.amount ?? 0).toLocaleString()}`,        color: "#0F172A" },
            { label: "FORMAT", value: event.payment_format ?? "WIRE"                                            },
          ].map(({ label, value, mono, color }) => (
            <div key={label}>
              <div style={{ fontSize: 10, color: "#64748B", fontWeight: 700, letterSpacing: "0.05em", marginBottom: 2 }}>{label}</div>
              <div style={{
                fontSize: 13, fontWeight: 700,
                fontFamily: mono ? "monospace" : "inherit",
                color: color ?? "#0F172A",
              }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Risk delta row */}
        {event.risk_delta && (
          <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
            {["from", "to"].map(side => {
              const delta = event.risk_delta[side] ?? 0;
              const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "─";
              const col   = delta > 0 ? "#FD625E" : "#01B8AA";
              return (
                <div key={side} style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>
                  Risk {side.toUpperCase()}:{" "}
                  <span style={{ color: col, fontWeight: 800 }}>
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
          background: "#F8FAFC", border: "1px solid #E2E8F0",
          color: "#64748B", cursor: "pointer",
          width: 28, height: 28, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 12, fontWeight: 700, flexShrink: 0,
          transition: "all 0.2s"
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "#E2E8F0"; e.currentTarget.style.color = "#0F172A"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.color = "#64748B"; }}
      >
        ✕
      </button>
    </div>
  );
}

// ─── connection status pill ───────────────────────────────────────────────────

function StatusPill({ status }) {
  const map = {
    connected:    { color: "#01B8AA", label: "LIVE STREAM", bg: "#F0FDFA", border: "#CCF5F2" },
    connecting:   { color: "#D97706", label: "CONNECTING…", bg: "#FFFBEB", border: "#FDE68A" },
    disconnected: { color: "#FD625E", label: "DISCONNECTED", bg: "#FFF5F5", border: "#FECACA" },
  };
  const s = map[status] ?? map.disconnected;
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      background: s.bg,
      border: `1px solid ${s.border}`,
      borderRadius: 9999,
      padding: "6px 14px",
      fontSize: 11, fontWeight: 800, color: s.color,
      marginBottom: 8,
      letterSpacing: "0.05em"
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: s.color,
        animation: status === "connected" ? "pulse-pill 2s infinite" : "none",
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
  const [total,   setTotal]   = useState(0);
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
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send("ping");
        }, 20_000);
      };

      ws.onmessage = (evt) => {
        if (evt.data === "pong" || evt.data === "ping") return;

        try {
          const msg = JSON.parse(evt.data);

          if (msg.type === "heartbeat") return;

          if (msg.type === "history") {
            const recent = (msg.events ?? []).slice(-3);
            setAlerts(recent.map((e, i) => ({ ...e, _id: `hist_${i}` })));
            return;
          }

          if (msg.type === "transaction") {
            setTotal(t => t + 1);
            const alert = { ...msg, _id: `${Date.now()}_${Math.random()}` };
            setAlerts(prev => [alert, ...prev].slice(0, MAX_QUEUE));

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
    return (
      <div style={{ marginBottom: 16 }}>
        <StatusPill status={status} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "#64748B", marginLeft: 12 }}>
          Watching for live transactions…  ({total} received this session)
        </span>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
        <StatusPill status={status} />
        {total > 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: "#64748B" }}>
            {total} transaction{total !== 1 ? "s" : ""} detected this session
          </span>
        )}
        {alerts.length > 0 && (
          <button
            onClick={() => setAlerts([])}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: "1px solid #FD625E",
              color: "#FD625E",
              padding: "6px 16px",
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s"
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "#FFF5F5"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            Clear all
          </button>
        )}
      </div>

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
        @keyframes pulse-pill {
          0%,100% { opacity:1; box-shadow: 0 0 4px rgba(1,184,170,0.3); }
          50%     { opacity:0.6; box-shadow: 0 0 8px rgba(1,184,170,0.6); }
        }
      `}</style>
    </div>
  );
}