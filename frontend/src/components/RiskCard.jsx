/**
 * RiskCard.jsx
 * ------------
 * Animated stat card with:
 *  - Count-up animation on mount
 *  - Colour-coded accent matching card type
 *  - Trend arrow (up / down / neutral)
 *  - Hover lift effect
 *  - Professional banking dashboard styling (Light theme)
 */

import { useEffect, useRef, useState } from "react";

// ─── theme map ────────────────────────────────────────────────────────────────
const THEMES = {
  default: {
    bg:      "#FFFFFF",
    border:  "#E2E8F0",
    accent:  "#01B8AA", // teal
    glow:    "rgba(1, 184, 170, 0.12)",
    text:    "#0F172A",
    sub:     "#64748B",
    icon:    null,
  },
  danger: {
    bg:      "#FFFFFF",
    border:  "#E2E8F0",
    accent:  "#FD625E", // coral red
    glow:    "rgba(253, 98, 94, 0.12)",
    text:    "#0F172A",
    sub:     "#64748B",
    icon:    null,
  },
  warning: {
    bg:      "#FFFFFF",
    border:  "#E2E8F0",
    accent:  "#F2C80F", // yellow
    glow:    "rgba(242, 200, 15, 0.12)",
    text:    "#0F172A",
    sub:     "#64748B",
    icon:    null,
  },
  success: {
    bg:      "#FFFFFF",
    border:  "#E2E8F0",
    accent:  "#01B8AA", // teal
    glow:    "rgba(1, 184, 170, 0.12)",
    text:    "#0F172A",
    sub:     "#64748B",
    icon:    null,
  },
  purple: {
    bg:      "#FFFFFF",
    border:  "#E2E8F0",
    accent:  "#8B5CF6", // purple
    glow:    "rgba(139, 92, 246, 0.12)",
    text:    "#0F172A",
    sub:     "#64748B",
    icon:    null,
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
      fontWeight: 800,
      color: up ? "#FD625E" : "#01B8AA",   // up = worse for fraud metrics
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
        borderRadius:  12, // Tighter corner radius for a sharper, premium look
        border:        "1px solid #E2E8F0",
        borderLeft:    `4px solid ${theme.accent}`, // Signature banking UI left border
        boxShadow:     hovered
          ? "0 4px 16px rgba(0,0,0,0.10)"
          : "0 2px 8px rgba(0,0,0,0.06)",
        padding:       "24px 28px",
        flex:          1,
        minWidth:      200,
        transform:     hovered ? "translateY(-2px)" : "translateY(0)", // Gentle lift
        transition:    "transform 0.25s ease, box-shadow 0.25s ease",
        position:      "relative",
        overflow:      "hidden",
      }}
    >
      {/* Decorative background glow circle */}
      <div style={{
        position:     "absolute",
        top:          -40,
        right:        -40,
        width:        120,
        height:       120,
        borderRadius: "50%",
        background:   theme.accent,
        opacity:      0.06, // extremely subtle tint to avoid overpowering white bg
        filter:       "blur(30px)",
        pointerEvents:"none",
      }} />

      {/* Icon + title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        {/* Render icon if provided (Dashboard passes colored divs) */}
        {icon && <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</span>}
        <span style={{
          fontSize:      11,
          fontWeight:    700,
          color:         "#64748B",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          {title}
        </span>
      </div>

      {/* Animated value */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontSize:   36,
          fontWeight: 900,
          color:      theme.accent,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
        }}>
          {formatValue(value, animated)}
        </span>
        <TrendArrow trend={trend} />
      </div>

      {/* Subtitle */}
      {subtitle && (
        <div style={{
          fontSize:   12,
          color:      "#64748B",
          marginTop:  10,
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
        background:   `linear-gradient(90deg, ${theme.accent}, transparent)`,
        borderRadius: "0 0 12px 12px",
        opacity:      0.8,
      }} />
    </div>
  );
}