/**
 * RiskCard.jsx
 * ------------
 * Animated stat card with:
 *  - Count-up animation on mount
 *  - Colour-coded glow matching card type
 *  - Trend arrow (up / down / neutral)
 *  - Hover lift effect
 */

import { useEffect, useRef, useState } from "react";

// ─── theme map ────────────────────────────────────────────────────────────────
const THEMES = {
  default: {
    border:  "#334155",
    glow:    "rgba(99,102,241,0.15)",
    accent:  "#818cf8",
    bg:      "linear-gradient(135deg,#1e293b,#0f172a)",
    icon:    "📊",
  },
  danger: {
    border:  "#ef4444",
    glow:    "rgba(239,68,68,0.18)",
    accent:  "#f87171",
    bg:      "linear-gradient(135deg,#2d0a0a,#1a0505)",
    icon:    "🚨",
  },
  warning: {
    border:  "#f97316",
    glow:    "rgba(249,115,22,0.18)",
    accent:  "#fb923c",
    bg:      "linear-gradient(135deg,#2d1208,#1a0a05)",
    icon:    "⚠️",
  },
  success: {
    border:  "#22c55e",
    glow:    "rgba(34,197,94,0.18)",
    accent:  "#4ade80",
    bg:      "linear-gradient(135deg,#052e16,#020f09)",
    icon:    "✅",
  },
  purple: {
    border:  "#a855f7",
    glow:    "rgba(168,85,247,0.18)",
    accent:  "#c084fc",
    bg:      "linear-gradient(135deg,#1e0a2e,#0d0517)",
    icon:    "🤖",
  },
};

// ─── count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target, duration = 1200) {
  const [display, setDisplay] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    // target might be a formatted string like "1,234" or "0.92" — parse it
    const numeric = parseFloat(String(target).replace(/,/g, ""));
    if (isNaN(numeric)) { setDisplay(target); return; }

    const start     = performance.now();
    const startVal  = 0;

    function tick(now) {
      const elapsed  = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased    = 1 - Math.pow(1 - progress, 3);
      const current  = startVal + (numeric - startVal) * eased;

      setDisplay(current);

      if (progress < 1) raf.current = requestAnimationFrame(tick);
    }

    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return display;
}

// ─── format display value matching original format ────────────────────────────
function formatValue(raw, animated) {
  const str = String(raw);
  // Detect decimal places in original
  if (str.includes(".")) {
    const decimals = str.split(".")[1]?.length ?? 2;
    return animated.toFixed(decimals);
  }
  // Integer — use locale string formatting
  return Math.round(animated).toLocaleString();
}

// ─── trend arrow ──────────────────────────────────────────────────────────────
function TrendArrow({ trend }) {
  if (!trend || trend === "neutral") return null;
  const up = trend === "up";
  return (
    <span style={{
      fontSize: 12,
      fontWeight: 700,
      color: up ? "#f87171" : "#4ade80",   // up = worse for fraud metrics
      marginLeft: 6,
    }}>
      {up ? "▲" : "▼"}
    </span>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function RiskCard({
  title,
  value,
  type    = "default",
  trend   = null,      // "up" | "down" | "neutral" | null
  subtitle = null,     // optional small text below value
  icon    = null,      // override icon
}) {
  const theme    = THEMES[type] ?? THEMES.default;
  const animated = useCountUp(value);
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:    theme.bg,
        borderRadius:  18,
        border:        `1px solid ${theme.border}`,
        boxShadow:     hovered
          ? `0 0 40px ${theme.glow}, 0 20px 40px rgba(0,0,0,0.4)`
          : `0 0 20px ${theme.glow}, 0 10px 20px rgba(0,0,0,0.3)`,
        padding:       "24px 28px",
        flex:          1,
        minWidth:      200,
        transform:     hovered ? "translateY(-6px)" : "translateY(0)",
        transition:    "transform 0.25s ease, box-shadow 0.25s ease",
        position:      "relative",
        overflow:      "hidden",
      }}
    >
      {/* Decorative background circle */}
      <div style={{
        position:     "absolute",
        top:          -30,
        right:        -30,
        width:        100,
        height:       100,
        borderRadius: "50%",
        background:   theme.glow,
        filter:       "blur(20px)",
        pointerEvents:"none",
      }} />

      {/* Icon + title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>{icon ?? theme.icon}</span>
        <span style={{
          fontSize:      11,
          fontWeight:    700,
          color:         "#64748b",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          {title}
        </span>
      </div>

      {/* Animated value */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{
          fontSize:   38,
          fontWeight: 900,
          color:      theme.accent,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
        }}>
          {formatValue(value, animated)}
        </span>
        <TrendArrow trend={trend} />
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{
          fontSize:   12,
          color:      "#475569",
          marginTop:  8,
          fontWeight: 500,
        }}>
          {subtitle}
        </div>
      )}

      {/* Bottom accent bar */}
      <div style={{
        position:     "absolute",
        bottom:       0,
        left:         0,
        right:        0,
        height:       3,
        background:   `linear-gradient(90deg, ${theme.border}, transparent)`,
        borderRadius: "0 0 18px 18px",
      }} />
    </div>
  );
}