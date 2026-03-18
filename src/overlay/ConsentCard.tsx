// EXTENSION FILE: src/overlay/ConsentCard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// First-visit consent card rendered inside a closed shadow DOM.
// Uses inline CSS-in-JS only (Tailwind cannot cross the shadow boundary).
//
// Lifecycle:
//   mount  → user sees card (bottom-right, draggable, minimizable)
//   Allow  → dispatches "toki:consent-granted" on document → host removes itself
//   Deny   → dispatches "toki:consent-denied"  on document → host removes itself
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useRef, useCallback, useEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DragState {
  dragging: boolean;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConsentCard({ siteName }: { siteName: string }) {
  const [minimised, setMinimised] = useState(false);
  const [pos, setPos]             = useState({ x: 0, y: 0 }); // offset from anchor
  const dragRef = useRef<DragState>({
    dragging: false, startX: 0, startY: 0, originX: 0, originY: 0,
  });

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, originX: pos.x, originY: pos.y };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.dragging) return;
    setPos({ x: d.originX + (e.clientX - d.startX), y: d.originY + (e.clientY - d.startY) });
  }, []);

  const onPointerUp = useCallback(() => {
    dragRef.current.dragging = false;
  }, []);

  // ── Decision ──────────────────────────────────────────────────────────────
  const decide = useCallback((allowed: boolean) => {
    document.dispatchEvent(
      new CustomEvent(allowed ? "toki:consent-granted" : "toki:consent-denied"),
    );
  }, []);

  // ── Minimised pill ────────────────────────────────────────────────────────
  if (minimised) {
    return (
      <div
        style={{
          position:     "fixed",
          bottom:       `${20 - pos.y}px`,
          right:        `${20 - pos.x}px`,
          zIndex:       2_147_483_647,
          background:   "#18181b",
          border:       "1px solid #3f3f46",
          borderRadius: "999px",
          padding:      "6px 12px",
          cursor:       "pointer",
          display:      "flex",
          alignItems:   "center",
          gap:          "6px",
          fontSize:     "12px",
          color:        "#a1a1aa",
          userSelect:   "none",
          boxShadow:    "0 4px 24px rgba(0,0,0,0.5)",
        }}
        onClick={() => setMinimised(false)}
        title="Expand Toki consent"
      >
        <span style={{ fontSize: "14px" }}>⚡</span>
        <span>Toki needs permission</span>
      </div>
    );
  }

  // ── Full card ─────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position:     "fixed",
        bottom:       `${20 - pos.y}px`,
        right:        `${20 - pos.x}px`,
        zIndex:       2_147_483_647,
        width:        "300px",
        background:   "#18181b",
        border:       "1px solid #3f3f46",
        borderRadius: "16px",
        boxShadow:    "0 8px 40px rgba(0,0,0,0.6)",
        fontFamily:   "system-ui, -apple-system, sans-serif",
        overflow:     "hidden",
        userSelect:   "none",
      }}
    >
      {/* ── Drag handle / header ──────────────────────────────────────── */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          padding:        "10px 14px 8px",
          cursor:         "grab",
          borderBottom:   "1px solid #27272a",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span style={{ fontSize: "16px" }}>⚡</span>
          <span style={{ fontSize: "13px", fontWeight: 700, color: "#f4f4f5" }}>Toki</span>
        </div>
        <button
          onClick={() => setMinimised(true)}
          style={{
            background: "none",
            border:     "none",
            cursor:     "pointer",
            color:      "#71717a",
            fontSize:   "16px",
            lineHeight: "1",
            padding:    "0 2px",
          }}
          title="Minimise"
        >
          −
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "14px 16px 16px" }}>
        <p style={{ fontSize: "13px", color: "#e4e4e7", lineHeight: "1.5", margin: "0 0 6px" }}>
          Allow <strong>Toki</strong> to track your AI usage on{" "}
          <strong>{siteName}</strong>?
        </p>
        <p style={{ fontSize: "11px", color: "#71717a", lineHeight: "1.5", margin: "0 0 16px" }}>
          All data stays local on your device.{" "}
          <strong style={{ color: "#a1a1aa" }}>Nothing is ever sent anywhere.</strong>
        </p>

        {/* ── Buttons ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={() => decide(true)}
            style={{
              flex:         1,
              padding:      "8px 0",
              borderRadius: "10px",
              border:       "none",
              background:   "#22c55e",
              color:        "#fff",
              fontSize:     "13px",
              fontWeight:   600,
              cursor:       "pointer",
              transition:   "background 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#16a34a"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#22c55e"; }}
          >
            Allow
          </button>
          <button
            onClick={() => decide(false)}
            style={{
              flex:         1,
              padding:      "8px 0",
              borderRadius: "10px",
              border:       "1px solid #3f3f46",
              background:   "transparent",
              color:        "#71717a",
              fontSize:     "13px",
              fontWeight:   500,
              cursor:       "pointer",
              transition:   "color 0.15s, border-color 0.15s",
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.color = "#f4f4f5"; b.style.borderColor = "#71717a";
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.color = "#71717a"; b.style.borderColor = "#3f3f46";
            }}
          >
            Deny
          </button>
        </div>

        <p style={{ fontSize: "10px", color: "#52525b", textAlign: "center", marginTop: "10px", marginBottom: 0 }}>
          You can change this anytime in the Toki popup.
        </p>
      </div>
    </div>
  );
}
