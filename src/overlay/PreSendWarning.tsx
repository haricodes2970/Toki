// EXTENSION FILE: src/overlay/PreSendWarning.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Pre-send interceptor modal that appears inside the Shadow DOM when:
//   a) estimated + current usage > WARNING_THRESHOLD of daily limit, OR
//   b) the prompt has optimization opportunities (word count > 300, filler, etc.)
//
// User choices:
//   "Send anyway"  – proceeds, records usage
//   "Optimize"     – shows suggestions panel
//   "Cancel"       – dismisses (user can edit the prompt)
//
// This component is SHOWN by Overlay.tsx when toki:pre-send event fires
// (dispatched from content.ts BEFORE the actual submit).
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState } from "react";
import type { OptimizerResult } from "./optimizer";
import { tokenLabel } from "./tokenizer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PreSendWarningProps {
  draftTokens:  number;
  totalIfSent:  number;
  limitTokens:  number;
  pct:          number;
  optimizer:    OptimizerResult;
  onSend:       () => void;   // user confirmed "send anyway"
  onCancel:     () => void;   // user cancelled
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreSendWarning({
  draftTokens, totalIfSent, limitTokens, pct, optimizer, onSend, onCancel,
}: PreSendWarningProps) {
  const [showOptimizer, setShowOptimizer] = useState(false);
  const isDanger = pct >= 90;

  const accentColour = isDanger ? "#ef4444" : "#f59e0b";
  const bgColour     = isDanger ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)";
  const borderColour = isDanger ? "rgba(239,68,68,0.25)" : "rgba(245,158,11,0.25)";
  const hasOptimizations = optimizer.suggestions.length > 0;

  return (
    <div style={S.backdrop}>
      <div style={{ ...S.modal, background: bgColour, border: `1px solid ${borderColour}` }}>

        {/* ── Icon + title ──────────────────────────────────────────── */}
        <div style={S.header}>
          <span style={{ fontSize: 20 }}>{isDanger ? "🔴" : "⚠️"}</span>
          <span style={{ ...S.title, color: accentColour }}>
            {isDanger ? "Near daily limit" : "High usage warning"}
          </span>
        </div>

        {/* ── Usage stats ───────────────────────────────────────────── */}
        <div style={S.statsBox}>
          <Row label="This prompt"   value={tokenLabel(draftTokens)} />
          <Row label="After sending" value={`${Math.round(pct)}% of daily limit`} bold />
          <Row label="Remaining"     value={tokenLabel(Math.max(limitTokens - totalIfSent, 0))} />
        </div>

        {/* Mini progress bar */}
        <div style={S.miniTrack}>
          <div style={{ ...S.miniFill, width: `${Math.min(pct, 100)}%`, background: accentColour }} />
        </div>

        {/* ── Optimizer suggestions (togglable) ─────────────────────── */}
        {hasOptimizations && (
          <button
            style={{ ...S.optimizeToggle, color: accentColour }}
            onClick={() => setShowOptimizer((v) => !v)}
          >
            ✨ {showOptimizer ? "Hide" : "Show"} optimization tips
            <span style={{ marginLeft: 4 }}>
              (save ~{tokenLabel(optimizer.totalSaving)})
            </span>
          </button>
        )}

        {showOptimizer && (
          <div style={S.suggestionsBox}>
            {optimizer.suggestions.map((s) => (
              <div key={s.id} style={S.suggestion}>
                <div style={S.suggestionHeader}>
                  <span style={S.suggestionTag}>{s.label}</span>
                  <span style={S.suggestionSaving}>~{s.saving} tokens</span>
                </div>
                <p style={S.suggestionDetail}>{s.detail}</p>
                {s.example && (
                  <p style={S.suggestionExample}>{s.example}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Actions ───────────────────────────────────────────────── */}
        <div style={S.actions}>
          <button style={S.cancelBtn} onClick={onCancel}>
            ← Edit prompt
          </button>
          <button
            style={{ ...S.sendBtn, background: accentColour }}
            onClick={onSend}
          >
            Send anyway →
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row sub-component ────────────────────────────────────────────────────────

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
      <span style={{ color: "#71717a", fontSize: 11 }}>{label}</span>
      <span style={{ color: bold ? "#e4e4e7" : "#a1a1aa", fontWeight: bold ? 700 : 400, fontSize: 11 }}>
        {value}
      </span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FONT = "'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

const S: Record<string, React.CSSProperties> = {
  backdrop: {
    position: "fixed",
    inset: 0,
    zIndex: 2147483646,
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    padding: 20,
    pointerEvents: "none",
  },
  modal: {
    width: 280,
    borderRadius: 16,
    padding: 16,
    fontFamily: FONT,
    fontSize: 12,
    color: "#e4e4e7",
    pointerEvents: "auto",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    animation: "toki-slide-in 0.2s ease",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontWeight: 700,
    fontSize: 14,
    letterSpacing: -0.3,
  },
  statsBox: {
    background: "rgba(255,255,255,0.04)",
    borderRadius: 8,
    padding: "8px 10px",
    marginBottom: 8,
  },
  miniTrack: {
    height: 3,
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginBottom: 10,
  },
  miniFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width 0.4s ease",
  },
  optimizeToggle: {
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    padding: "4px 0",
    display: "block",
    marginBottom: 6,
    fontFamily: FONT,
  },
  suggestionsBox: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: 8,
    padding: "8px 10px",
    marginBottom: 10,
    maxHeight: 200,
    overflowY: "auto" as const,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  suggestion: {},
  suggestionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  suggestionTag: {
    fontSize: 10,
    fontWeight: 700,
    color: "#a1a1aa",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  suggestionSaving: {
    fontSize: 10,
    color: "#52525b",
  },
  suggestionDetail: {
    fontSize: 11,
    color: "#71717a",
    lineHeight: 1.5,
    margin: 0,
  },
  suggestionExample: {
    fontSize: 10,
    color: "#52525b",
    fontStyle: "italic",
    marginTop: 3,
    padding: "3px 6px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: 4,
    borderLeft: "2px solid rgba(255,255,255,0.1)",
  },
  actions: {
    display: "flex",
    gap: 8,
    marginTop: 4,
  },
  cancelBtn: {
    flex: 1,
    padding: "7px 0",
    borderRadius: 10,
    background: "rgba(255,255,255,0.06)",
    border: "none",
    color: "#a1a1aa",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: FONT,
  },
  sendBtn: {
    flex: 1,
    padding: "7px 0",
    borderRadius: 10,
    border: "none",
    color: "#fff",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: FONT,
  },
};
