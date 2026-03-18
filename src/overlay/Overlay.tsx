// EXTENSION FILE: src/overlay/Overlay.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Floating, draggable, minimizable overlay panel living inside a Shadow DOM.
// Listens to CustomEvents dispatched by content.ts:
//
//   toki:prompt-update   – fired on every keystroke with live token estimate
//   toki:usage-recorded  – fired after a prompt is committed to storage
//   toki:pre-send        – fired before submit, triggers PreSendWarning modal
//
// All styles are inline CSS-in-JS (no Tailwind class names reach the shadow).
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "react";
import type { SiteId, UsageRecord, TokiSettings } from "@/shared/types";
import { DEFAULT_LIMITS, SITE_CONFIGS } from "@/shared/constants";
import WarningToast, { type ToastPayload } from "./WarningToast";
import PreSendWarning from "./PreSendWarning";
import { analyzePrompt } from "./optimizer";
import type { PromptUpdateDetail, UsageRecordedDetail, PreSendDetail } from "@/content";
import { tokenLabel } from "./tokenizer";

// ─── Props ────────────────────────────────────────────────────────────────────

interface OverlayProps {
  siteId: SiteId;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Level = "safe" | "warning" | "danger";

function getLevel(pct: number): Level {
  if (pct < 80) return "safe";
  if (pct < 90) return "warning";
  return "danger";
}

const LEVEL_COLOURS: Record<Level, { bar: string; text: string; glow: string }> = {
  safe:    { bar: "#22c55e", text: "#4ade80", glow: "rgba(34,197,94,0.25)"  },
  warning: { bar: "#f59e0b", text: "#fbbf24", glow: "rgba(245,158,11,0.25)" },
  danger:  { bar: "#ef4444", text: "#f87171", glow: "rgba(239,68,68,0.30)"  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function Overlay({ siteId }: OverlayProps) {
  // ── Persistent usage state (synced from chrome.storage) ─────────────────
  const [tokens, setTokens]         = useState(0);
  const [prompts, setPrompts]       = useState(0);
  const [dailyLimit, setDailyLimit] = useState(DEFAULT_LIMITS[siteId]);

  // ── Live draft state (from toki:prompt-update events) ───────────────────
  const [draftTokens, setDraftTokens]   = useState(0);
  const [draftPct, setDraftPct]         = useState(0);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [minimised, setMinimised]       = useState(false);
  const [editingLimit, setEditingLimit] = useState(false);
  const [limitDraft, setLimitDraft]     = useState(String(dailyLimit));
  const [resetTime, setResetTime]       = useState("--:--:--");
  const [toast, setToast]               = useState<ToastPayload | null>(null);
  const [preSend, setPreSend]           = useState<PreSendDetail | null>(null);

  // ── Drag state ────────────────────────────────────────────────────────────
  const [dragging, setDragging]   = useState(false);
  const [position, setPosition]   = useState({ x: 20, y: 20 });
  const dragOffset                = useRef({ x: 0, y: 0 });

  const siteLabel = SITE_CONFIGS[siteId].label;

  // ── Derived ───────────────────────────────────────────────────────────────
  // Show draft pct when the user is actively typing, else stored pct
  const displayPct    = draftTokens > 0 ? draftPct : (dailyLimit > 0 ? Math.min((tokens / dailyLimit) * 100, 100) : 0);
  const remaining     = Math.max(dailyLimit - tokens, 0);
  const avgPerPrompt  = prompts > 0 ? Math.round(tokens / prompts) : 1000;
  const estimatedLeft = remaining > 0 ? Math.max(Math.floor(remaining / avgPerPrompt), 0) : 0;
  const level         = getLevel(displayPct);
  const colours       = LEVEL_COLOURS[level];

  // ── Load from storage on mount ────────────────────────────────────────────
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "GET_USAGE", payload: { siteId } })
      .then((records: UsageRecord[]) => {
        if (!Array.isArray(records)) return;
        let t = 0, p = 0;
        for (const r of records) { t += r.tokens; p += r.prompts; }
        setTokens(t);
        setPrompts(p);
      })
      .catch(() => {});

    chrome.runtime.sendMessage({ type: "GET_SETTINGS" })
      .then((s: TokiSettings | null) => {
        const lim = s?.limits?.[siteId];
        if (lim) { setDailyLimit(lim); setLimitDraft(String(lim)); }
      })
      .catch(() => {});
  }, [siteId]);

  // ── USAGE_UPDATED from background (after another tab records usage) ───────
  useEffect(() => {
    function handler(msg: { type: string; payload?: UsageRecord }) {
      if (msg.type === "USAGE_UPDATED" && msg.payload?.siteId === siteId) {
        setTokens((prev) => prev + (msg.payload?.tokens ?? 0));
        setPrompts((prev) => prev + (msg.payload?.prompts ?? 0));
      }
    }
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [siteId]);

  // ── toki:prompt-update (live typing estimates from content.ts) ────────────
  useEffect(() => {
    function handler(e: Event) {
      const { tokens: draft, pct, isOverWarning, isOverDanger, totalIfSent, limitTokens }
        = (e as CustomEvent<PromptUpdateDetail>).detail;

      setDraftTokens(draft);
      setDraftPct(pct);

      // Decide whether to show / escalate a toast
      if (isOverDanger) {
        setToast({
          severity: "danger",
          draftTokens: draft,
          totalIfSent,
          limitTokens,
          pct,
        });
      } else if (isOverWarning) {
        setToast((prev) =>
          prev?.severity === "danger"
            ? prev   // don't downgrade danger → warning mid-session
            : { severity: "warning", draftTokens: draft, totalIfSent, limitTokens, pct },
        );
      } else {
        // Draft is safe – clear any existing toast
        setToast(null);
      }
    }

    document.addEventListener("toki:prompt-update", handler);
    return () => document.removeEventListener("toki:prompt-update", handler);
  }, []);

  // ── toki:usage-recorded (prompt was sent – refresh stored count) ──────────
  useEffect(() => {
    function handler(e: Event) {
      const { tokens: sent, prompts: p } = (e as CustomEvent<UsageRecordedDetail>).detail;
      setTokens((prev) => prev + sent);
      setPrompts((prev) => prev + p);
      setDraftTokens(0);
      setDraftPct(0);
      setPreSend(null);
    }
    document.addEventListener("toki:usage-recorded", handler);
    return () => document.removeEventListener("toki:usage-recorded", handler);
  }, []);

  // ── toki:pre-send (intercepted submit – show modal) ───────────────────────
  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<PreSendDetail>).detail;
      // Only intercept if over warning threshold or has optimizer suggestions
      const optimizer = analyzePrompt(detail.promptText);
      if (detail.isOverWarning || optimizer.suggestions.length > 0) {
        setPreSend(detail);
      } else {
        // Safe to send – dispatch confirmation immediately
        document.dispatchEvent(new CustomEvent("toki:pre-send-confirmed"));
      }
    }
    document.addEventListener("toki:pre-send", handler);
    return () => document.removeEventListener("toki:pre-send", handler);
  }, []);

  // ── Reset countdown ───────────────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const diff = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setResetTime(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`,
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Drag ──────────────────────────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    setDragging(true);
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
  }, [dragging]);

  const onPointerUp = useCallback(() => setDragging(false), []);

  // ── Save custom limit ─────────────────────────────────────────────────────
  const saveLimit = useCallback(() => {
    const parsed = parseInt(limitDraft, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      setDailyLimit(parsed);
      chrome.runtime.sendMessage({
        type: "SET_SETTINGS",
        payload: { limits: { [siteId]: parsed } },
      }).catch(() => {});
    }
    setEditingLimit(false);
  }, [limitDraft, siteId]);

  // ── Battery segments ──────────────────────────────────────────────────────
  const batterySegments = useMemo(() => {
    const total  = 10;
    const filled = Math.round((displayPct / 100) * total);
    return Array.from({ length: total }, (_, i) => i < filled);
  }, [displayPct]);

  // ── Minimised pill ────────────────────────────────────────────────────────
  if (minimised) {
    return (
      <div
        style={{ ...S.pill, background: colours.bar, left: position.x, top: position.y }}
        onClick={() => setMinimised(false)}
        title="Expand Toki"
      >
        <span>⚡</span>
        <span style={S.pillPct}>{Math.round(displayPct)}%</span>
      </div>
    );
  }

  // ── Full panel ────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        ...S.wrapper,
        left: position.x,
        top: position.y,
        cursor: dragging ? "grabbing" : "default",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Pre-send warning modal */}
      {preSend && (
        <PreSendWarning
          draftTokens={preSend.draftTokens}
          totalIfSent={preSend.totalIfSent}
          limitTokens={preSend.limitTokens}
          pct={preSend.pct}
          optimizer={analyzePrompt(preSend.promptText)}
          onSend={() => {
            setPreSend(null);
            document.dispatchEvent(new CustomEvent("toki:pre-send-confirmed"));
          }}
          onCancel={() => {
            setPreSend(null);
            document.dispatchEvent(new CustomEvent("toki:pre-send-cancelled"));
          }}
        />
      )}

      {/* Toast stacks above the panel */}
      <WarningToast payload={toast} onDismiss={() => setToast(null)} />

      <div
        style={{
          ...S.panel,
          boxShadow: `0 8px 32px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.05)`,
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={S.header}>
          <div style={S.headerLeft}>
            <span style={{ fontSize: 16 }}>⚡</span>
            <span style={S.title}>Toki</span>
            <span style={{ ...S.badge, background: colours.glow, color: colours.text }}>
              {siteLabel}
            </span>
          </div>
          <button style={S.iconBtn} onClick={() => setMinimised(true)} title="Minimise">─</button>
        </div>

        {/* ── Live draft indicator (appears only while typing) ─────── */}
        {draftTokens > 0 && (
          <div style={{ ...S.draftBar, borderColor: colours.bar }}>
            <span style={{ color: colours.text }}>✎ Draft: {tokenLabel(draftTokens)}</span>
            <span style={{ color: "#71717a" }}>→ {Math.round(draftPct)}% total</span>
          </div>
        )}

        {/* ── Battery segments ─────────────────────────────────────── */}
        <div style={S.batteryOuter}>
          <div style={S.batteryTrack}>
            {batterySegments.map((filled, i) => (
              <div
                key={i}
                style={{
                  ...S.segment,
                  background: filled ? colours.bar : "rgba(255,255,255,0.06)",
                  opacity: filled ? 1 : 0.4,
                }}
              />
            ))}
          </div>
          <span style={{ ...S.pctLabel, color: colours.text }}>
            {Math.round(displayPct)}%
          </span>
        </div>

        {/* ── Smooth progress bar ───────────────────────────────────── */}
        <div style={S.progressTrack}>
          <div
            style={{
              ...S.progressFill,
              width: `${displayPct}%`,
              background: `linear-gradient(90deg, ${colours.bar}, ${colours.text})`,
              boxShadow: `0 0 8px ${colours.glow}`,
            }}
          />
        </div>

        {/* ── Stats grid ───────────────────────────────────────────── */}
        <div style={S.statsGrid}>
          <StatItem label="Used"          value={fmt(tokens)}           sub="tokens" />
          <StatItem label="Remaining"     value={fmt(remaining)}        sub="tokens" />
          <StatItem label="Prompts Left"  value={`~${estimatedLeft}`}   sub="est."   />
          <StatItem label="Resets In"     value={resetTime}             sub=""       />
        </div>

        {/* ── Daily limit row ──────────────────────────────────────── */}
        <div style={S.limitRow}>
          <span style={{ color: "#71717a", fontSize: 12 }}>Daily limit:</span>
          {editingLimit ? (
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                style={S.limitInput}
                value={limitDraft}
                onChange={(e) => setLimitDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")  saveLimit();
                  if (e.key === "Escape") setEditingLimit(false);
                }}
                autoFocus
              />
              <button style={S.saveBtn} onClick={saveLimit}>✓</button>
            </span>
          ) : (
            <span
              style={{ color: "#a1a1aa", fontSize: 12, cursor: "pointer" }}
              onClick={() => setEditingLimit(true)}
              title="Click to edit"
            >
              {fmt(dailyLimit)} tokens ✎
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── StatItem ─────────────────────────────────────────────────────────────────

function StatItem({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={S.stat}>
      <div style={S.statLabel}>{label}</div>
      <div style={S.statValue}>{value}</div>
      {sub && <div style={S.statSub}>{sub}</div>}
    </div>
  );
}

// ─── Format ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FONT = "'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif";

const S: Record<string, React.CSSProperties> = {
  // Outer wrapper – positions both toast + panel together
  wrapper: {
    position: "fixed",
    zIndex: 2147483647,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    pointerEvents: "none",
    userSelect: "none",
    fontFamily: FONT,
  },
  panel: {
    width: 280,
    borderRadius: 16,
    background: "rgba(15,15,20,0.92)",
    backdropFilter: "blur(20px) saturate(1.4)",
    WebkitBackdropFilter: "blur(20px) saturate(1.4)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#e4e4e7",
    overflow: "hidden",
    pointerEvents: "auto",
  },

  // Minimised pill
  pill: {
    position: "fixed",
    zIndex: 2147483647,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 14px",
    borderRadius: 999,
    cursor: "pointer",
    fontFamily: FONT,
    fontSize: 13,
    fontWeight: 600,
    color: "#fff",
    pointerEvents: "auto",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
  },
  pillPct: { letterSpacing: -0.3 },

  // Header
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px 8px",
    cursor: "grab",
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 8 },
  title: { fontWeight: 700, fontSize: 15, letterSpacing: -0.4, color: "#fff" },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  iconBtn: {
    background: "rgba(255,255,255,0.06)",
    border: "none",
    color: "#a1a1aa",
    width: 24,
    height: 24,
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "auto",
  },

  // Draft indicator
  draftBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    margin: "0 14px 6px",
    padding: "4px 10px",
    borderRadius: 8,
    fontSize: 11,
    borderLeft: "3px solid",
    background: "rgba(255,255,255,0.04)",
  },

  // Battery
  batteryOuter: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 14px",
    marginBottom: 4,
  },
  batteryTrack: { flex: 1, display: "flex", gap: 3 },
  segment: {
    flex: 1,
    height: 18,
    borderRadius: 3,
    transition: "background 0.3s ease, opacity 0.3s ease",
  },
  pctLabel: {
    fontWeight: 700,
    fontSize: 18,
    minWidth: 48,
    textAlign: "right" as const,
    letterSpacing: -0.5,
    fontVariantNumeric: "tabular-nums",
  },

  // Progress bar
  progressTrack: {
    margin: "6px 14px 10px",
    height: 4,
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width 0.5s cubic-bezier(0.4,0,0.2,1)",
  },

  // Stats
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 2,
    padding: "0 14px 10px",
  },
  stat: {
    background: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    padding: "8px 10px",
    textAlign: "center" as const,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: 500,
    color: "#71717a",
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
    fontVariantNumeric: "tabular-nums",
    letterSpacing: -0.3,
  },
  statSub: { fontSize: 10, color: "#52525b", marginTop: 1 },

  // Limit row
  limitRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 14px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  limitInput: {
    width: 72,
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 6,
    padding: "3px 6px",
    color: "#fff",
    fontSize: 12,
    fontFamily: FONT,
    outline: "none",
  },
  saveBtn: {
    background: "#22c55e",
    border: "none",
    color: "#fff",
    width: 22,
    height: 22,
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
};
