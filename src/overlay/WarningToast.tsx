// EXTENSION FILE: src/overlay/WarningToast.tsx
// ─────────────────────────────────────────────────────────────────────────────
// A standalone, auto-dismissing toast that renders inside the Shadow DOM.
// It is imperatively shown/hidden by the Overlay parent – it does NOT manage
// its own visibility based on prompt-update events (that's Overlay's job).
//
// Two severity levels:
//   warning – amber  – pct 80–89%
//   danger  – red    – pct 90%+
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef } from "react";
import { tokenLabel } from "./tokenizer";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastSeverity = "warning" | "danger";

export interface ToastPayload {
  severity:     ToastSeverity;
  draftTokens:  number;
  totalIfSent:  number;
  limitTokens:  number;
  pct:          number;
}

interface WarningToastProps {
  payload:   ToastPayload | null;   // null = hidden
  onDismiss: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WarningToast({ payload, onDismiss }: WarningToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss after 6 seconds (danger) / 4 seconds (warning)
  useEffect(() => {
    if (!payload) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const delay = payload.severity === "danger" ? 6000 : 4000;
    timerRef.current = setTimeout(onDismiss, delay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [payload, onDismiss]);

  if (!payload) return null;

  const { severity, draftTokens, totalIfSent, limitTokens, pct } = payload;
  const remaining = Math.max(limitTokens - totalIfSent, 0);

  const colours =
    severity === "danger"
      ? { bg: "rgba(239,68,68,0.10)",  border: "rgba(239,68,68,0.35)",  icon: "🔴", text: "#f87171" }
      : { bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.35)", icon: "⚠️", text: "#fbbf24" };

  return (
    <div style={{ ...S.toast, background: colours.bg, border: `1px solid ${colours.border}` }}>
      {/* Icon + heading */}
      <div style={S.toastHeader}>
        <span style={S.toastIcon}>{colours.icon}</span>
        <span style={{ ...S.toastTitle, color: colours.text }}>
          {severity === "danger" ? "Approaching limit" : "Usage warning"}
        </span>
        <button style={S.dismissBtn} onClick={onDismiss} title="Dismiss">✕</button>
      </div>

      {/* Stats */}
      <div style={S.toastBody}>
        <ToastRow label="This prompt" value={tokenLabel(draftTokens)} />
        <ToastRow label="After sending" value={`${Math.round(pct)}% of daily limit`} highlight />
        <ToastRow label="Remaining" value={tokenLabel(remaining)} />
      </div>

      {/* Progress mini-bar */}
      <div style={S.miniTrack}>
        <div
          style={{
            ...S.miniFill,
            width: `${Math.min(pct, 100)}%`,
            background: colours.text,
          }}
        />
      </div>
    </div>
  );
}

// ─── Row sub-component ────────────────────────────────────────────────────────

function ToastRow({
  label, value, highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={S.toastRow}>
      <span style={S.toastRowLabel}>{label}</span>
      <span style={{ ...S.toastRowValue, fontWeight: highlight ? 700 : 500 }}>{value}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FONT =
  "'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

const S: Record<string, React.CSSProperties> = {
  toast: {
    width: 260,
    borderRadius: 12,
    overflow: "hidden",
    fontFamily: FONT,
    fontSize: 12,
    color: "#e4e4e7",
    animation: "toki-slide-in 0.2s ease",
    pointerEvents: "auto",
    marginBottom: 8,
  },
  toastHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 10px 6px",
  },
  toastIcon: { fontSize: 13 },
  toastTitle: {
    flex: 1,
    fontWeight: 600,
    fontSize: 12,
    letterSpacing: -0.2,
  },
  dismissBtn: {
    background: "none",
    border: "none",
    color: "#71717a",
    cursor: "pointer",
    fontSize: 10,
    lineHeight: 1,
    padding: 2,
  },
  toastBody: {
    padding: "0 10px 8px",
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },
  toastRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toastRowLabel: { color: "#71717a" },
  toastRowValue: { color: "#d4d4d8" },
  miniTrack: {
    height: 3,
    background: "rgba(255,255,255,0.06)",
  },
  miniFill: {
    height: "100%",
    transition: "width 0.4s ease",
    borderRadius: 999,
  },
};
