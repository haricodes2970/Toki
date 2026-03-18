// EXTENSION FILE: src/popup/Popup.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Popup Settings & At-a-Glance Dashboard
//
// Sections:
//  1. Per-site usage bars (today's tokens vs limit)
//  2. Per-site daily limit inputs (saved to chrome.storage.sync)
//  3. Global settings (warning threshold, overlay toggle, reset timezone)
//  4. Manual reset button
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from "react";
import { createRoot } from "react-dom/client";
import "./popup.css";
import type {
  SiteId,
  TokiSettings,
  DailyLimits,
  UsageRecord,
  SiteState,
  SitePlan,
} from "@/shared/types";
import { DEFAULT_LIMITS, SITE_CONFIGS, STORAGE_KEYS, PLAN_PRESETS } from "@/shared/constants";

// ─── All 4 sites in display order ────────────────────────────────────────────

const SITES: SiteId[] = ["chatgpt", "gemini", "claude", "grok"];

const SITE_COLOURS: Record<SiteId, string> = {
  chatgpt: "#22c55e",
  gemini:  "#3b82f6",
  claude:  "#f97316",
  grok:    "#a855f7",
};

// ─── Root Component ──────────────────────────────────────────────────────────

function Popup() {
  // ── Settings state ──────────────────────────────────────────────────────
  const [limits, setLimits]               = useState<DailyLimits>({ ...DEFAULT_LIMITS });
  const [warningThreshold, setWarningPct] = useState(80);
  const [overlayEnabled, setOverlay]      = useState(true);
  const [usage, setUsage]                 = useState<Record<SiteId, number>>({
    chatgpt: 0, gemini: 0, claude: 0, grok: 0,
  });
  const [prompts, setPrompts] = useState<Record<SiteId, number>>({
    chatgpt: 0, gemini: 0, claude: 0, grok: 0,
  });
  // Selected plan per site (drives limit preset auto-fill in Settings tab)
  const [plans, setPlans] = useState<Record<SiteId, SitePlan>>({
    chatgpt: "free", gemini: "free", claude: "free", grok: "free",
  });
  // Offset = tokens manually declared by user ("already used X today")
  const [offsets, setOffsets] = useState<Record<SiteId, number>>({
    chatgpt: 0, gemini: 0, claude: 0, grok: 0,
  });
  // Controlled string for each offset input (so user can clear/type freely)
  const [offsetDraft, setOffsetDraft] = useState<Record<SiteId, string>>({
    chatgpt: "", gemini: "", claude: "", grok: "",
  });
  const [resetTime, setResetTime] = useState("--:--:--");
  const [saved, setSaved]         = useState(false);
  const [tab, setTab]             = useState<"usage" | "settings">("usage");

  // ── Load on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    // Settings from sync storage (persists across devices)
    chrome.storage.sync.get(STORAGE_KEYS.SETTINGS, (data) => {
      const s = data[STORAGE_KEYS.SETTINGS] as TokiSettings | undefined;
      if (s) {
        setLimits(s.limits);
        setWarningPct(Math.round((s.warningThreshold ?? 0.8) * 100));
        setOverlay(s.overlayEnabled ?? true);
      }
    });

    // Per-site plans and offsets from SITE_STATE
    chrome.storage.local.get(STORAGE_KEYS.SITE_STATE, (data) => {
      const store = (data[STORAGE_KEYS.SITE_STATE] ?? {}) as Record<string, SiteState>;
      const hmMap: Record<SiteId, string> = {
        chatgpt: "chatgpt.com",
        gemini:  "gemini.google.com",
        claude:  "claude.ai",
        grok:    "grok.x.ai",
      };
      const o: Record<SiteId, number>   = { chatgpt: 0,      gemini: 0,     claude: 0,     grok: 0 };
      const p: Record<SiteId, SitePlan> = { chatgpt: "free", gemini: "free", claude: "free", grok: "free" };
      for (const site of SITES) {
        const ss = store[hmMap[site]];
        if (ss) {
          o[site] = ss.offsetTokens ?? 0;
          p[site] = ss.plan ?? "free";
        }
      }
      setOffsets(o);
      setPlans(p);
      setOffsetDraft({ chatgpt: "", gemini: "", claude: "", grok: "" });
    });

    // Usage from local storage (device-local, high-write)
    chrome.storage.local.get(STORAGE_KEYS.USAGE, (data) => {
      const raw = (data[STORAGE_KEYS.USAGE] ?? {}) as Record<string, UsageRecord>;
      const today = new Date().toISOString().slice(0, 10);
      const u: Record<SiteId, number> = { chatgpt: 0, gemini: 0, claude: 0, grok: 0 };
      const p: Record<SiteId, number> = { chatgpt: 0, gemini: 0, claude: 0, grok: 0 };
      for (const [key, rec] of Object.entries(raw)) {
        if (!key.endsWith(`::${today}`)) continue;
        const site = key.split("::")[0] as SiteId;
        u[site] += rec.tokens;
        p[site] += rec.prompts;
      }
      setUsage(u);
      setPrompts(p);
    });
  }, []);

  // ── Reset countdown ────────────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now      = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const diff     = midnight.getTime() - now.getTime();
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setResetTime(`${pad(h)}:${pad(m)}:${pad(s)}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Live updates while popup is open ───────────────────────────────────
  useEffect(() => {
    function handler(msg: { type: string; payload?: UsageRecord }) {
      if (msg.type === "USAGE_UPDATED" && msg.payload) {
        const { siteId, tokens, prompts: p } = msg.payload;
        setUsage((prev) => ({ ...prev, [siteId]: prev[siteId] + tokens }));
        setPrompts((prev) => ({ ...prev, [siteId]: prev[siteId] + p }));
      }
    }
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  // ── Save settings to both sync + local ─────────────────────────────────
  const saveSettings = useCallback(() => {
    const settings: TokiSettings = {
      limits,
      warningThreshold: warningThreshold / 100,
      overlayPosition: "top-right",
      overlayEnabled: overlayEnabled,
    };
    // sync = persists across devices, local = immediate for content scripts
    chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: settings });
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [limits, warningThreshold, overlayEnabled]);

  // ── Manual reset ───────────────────────────────────────────────────────
  const manualReset = useCallback(() => {
    chrome.runtime.sendMessage({ type: "RESET_USAGE" }).then(() => {
      setUsage({ chatgpt: 0, gemini: 0, claude: 0, grok: 0 });
      setPrompts({ chatgpt: 0, gemini: 0, claude: 0, grok: 0 });
    });
  }, []);

  // ── Limit change handler ───────────────────────────────────────────────
  const onLimitChange = (site: SiteId, val: string) => {
    const n = parseInt(val, 10);
    if (!Number.isNaN(n) && n >= 0) {
      setLimits((prev) => ({ ...prev, [site]: n }));
    }
  };

  // Hostname lookup (stable, defined once at component scope)
  const HOSTNAME_MAP: Record<SiteId, string> = {
    chatgpt: "chatgpt.com",
    gemini:  "gemini.google.com",
    claude:  "claude.ai",
    grok:    "grok.x.ai",
  };

  // ── Plan change handler ─────────────────────────────────────────────────
  // Selecting a preset auto-fills the token limit; "custom" leaves it untouched.
  const onPlanChange = useCallback((site: SiteId, plan: SitePlan) => {
    setPlans((prev) => ({ ...prev, [site]: plan }));
    const preset = PLAN_PRESETS[site][plan];
    if (plan !== "custom" && preset !== undefined) {
      setLimits((prev) => ({ ...prev, [site]: preset }));
    }
    // Persist plan choice to SITE_STATE
    const hostname = HOSTNAME_MAP[site];
    chrome.storage.local.get(STORAGE_KEYS.SITE_STATE, (data) => {
      const store   = (data[STORAGE_KEYS.SITE_STATE] ?? {}) as Record<string, SiteState>;
      const current = store[hostname] ?? { plan: "free", offsetTokens: 0, consented: null, lastReset: Date.now(), messageTimestamps: [] };
      store[hostname] = { ...current, plan };
      chrome.storage.local.set({ [STORAGE_KEYS.SITE_STATE]: store });
    });
  }, []);

  // ── Offset save handler ─────────────────────────────────────────────────
  const saveOffset = useCallback((site: SiteId) => {
    const raw = offsetDraft[site];
    const n   = parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0) return;
    const hostname = HOSTNAME_MAP[site];
    // Read current state, patch offsetTokens, write back
    chrome.storage.local.get(STORAGE_KEYS.SITE_STATE, (data) => {
      const store   = (data[STORAGE_KEYS.SITE_STATE] ?? {}) as Record<string, SiteState>;
      const current = store[hostname] ?? { plan: "free", offsetTokens: 0, consented: null, lastReset: Date.now(), messageTimestamps: [] };
      store[hostname] = { ...current, offsetTokens: n };
      chrome.storage.local.set({ [STORAGE_KEYS.SITE_STATE]: store });
      setOffsets((prev) => ({ ...prev, [site]: n }));
      setOffsetDraft((prev) => ({ ...prev, [site]: "" }));
    });
  }, [offsetDraft]);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-[480px]">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-2">
        <span className="text-lg">⚡</span>
        <h1 className="text-base font-bold tracking-tight">Toki</h1>
        <span className="ml-auto text-[10px] text-zinc-500 font-mono">{resetTime}</span>
      </div>

      {/* ── Tab switcher ─────────────────────────────────────────────── */}
      <div className="flex mx-4 mb-3 rounded-lg bg-zinc-900 p-0.5">
        <TabBtn active={tab === "usage"}    onClick={() => setTab("usage")}>Usage</TabBtn>
        <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}>Settings</TabBtn>
      </div>

      {/* ── Usage tab ────────────────────────────────────────────────── */}
      {tab === "usage" && (
        <div className="flex-1 px-4 pb-4 space-y-2.5">
          {SITES.map((site) => {
            // Effective usage = tracked tokens + manual offset
            const effective  = usage[site] + offsets[site];
            const pct        = limits[site] > 0
              ? Math.min((effective / limits[site]) * 100, 100)
              : 0;
            const left       = Math.max(limits[site] - effective, 0);
            const avgPer     = prompts[site] > 0 ? Math.round(usage[site] / prompts[site]) : 1_000;
            const promptsLeft = left > 0 ? Math.floor(left / avgPer) : 0;

            return (
              <div key={site} className="rounded-xl bg-zinc-900/70 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full"
                      style={{ background: SITE_COLOURS[site] }}
                    />
                    <span className="text-xs font-semibold">{SITE_CONFIGS[site].label}</span>
                  </div>
                  <span className="text-[10px] text-zinc-500 tabular-nums">
                    {fmt(effective)} / {fmt(limits[site])}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 rounded-full bg-zinc-800 overflow-hidden mb-1.5">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: pct >= 90 ? "#ef4444" : pct >= 80 ? "#f59e0b" : SITE_COLOURS[site],
                    }}
                  />
                </div>

                <div className="flex justify-between text-[10px] text-zinc-500 mb-2">
                  <span>{Math.round(pct)}% used</span>
                  <span>~{promptsLeft} prompts left</span>
                </div>

                {/* ── Manual offset input ────────────────────────────────── */}
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    step={100}
                    placeholder={offsets[site] > 0 ? String(offsets[site]) : "Already used…"}
                    value={offsetDraft[site]}
                    onChange={(e) =>
                      setOffsetDraft((prev) => ({ ...prev, [site]: e.target.value }))
                    }
                    onKeyDown={(e) => { if (e.key === "Enter") saveOffset(site); }}
                    className="flex-1 h-7 rounded-md bg-zinc-800 border border-zinc-700 px-2 text-[11px] text-white placeholder-zinc-600 outline-none focus:border-toki-500 focus:ring-1 focus:ring-toki-500/30 tabular-nums"
                  />
                  <button
                    onClick={() => saveOffset(site)}
                    disabled={!offsetDraft[site]}
                    className="h-7 px-2 rounded-md text-[11px] font-medium bg-zinc-700 hover:bg-zinc-600 text-zinc-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Set
                  </button>
                  {offsets[site] > 0 && (
                    <span className="text-[10px] text-zinc-600 tabular-nums">
                      +{fmt(offsets[site])} offset
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Reset button */}
          <button
            onClick={manualReset}
            className="w-full mt-2 py-2 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          >
            Reset Today's Usage
          </button>

          {/* Open full dashboard */}
          <button
            onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/dashboard.html") })}
            className="w-full py-2 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-toki-400 hover:text-toki-300 transition-colors border border-zinc-800"
          >
            📊 View Full Dashboard
          </button>
        </div>
      )}

      {/* ── Settings tab ─────────────────────────────────────────────── */}
      {tab === "settings" && (
        <div className="flex-1 px-4 pb-4 space-y-4">
          {/* Plan presets */}
          <Section title="Your Plan">
            <div className="space-y-2">
              {SITES.map((site) => {
                const presets = Object.keys(PLAN_PRESETS[site]) as SitePlan[];
                return (
                  <div key={site} className="flex items-center gap-3">
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: SITE_COLOURS[site] }}
                    />
                    <label className="text-xs text-zinc-400 w-16">{SITE_CONFIGS[site].label}</label>
                    <select
                      value={plans[site]}
                      onChange={(e) => onPlanChange(site, e.target.value as SitePlan)}
                      className="flex-1 h-8 rounded-lg bg-zinc-800 border border-zinc-700 px-2 text-xs text-white outline-none focus:border-toki-500 capitalize"
                    >
                      {presets.map((p) => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5">
              Selecting a plan auto-fills the daily token limit below.
            </p>
          </Section>

          {/* Per-site limits */}
          <Section title="Daily Token Limits">
            <div className="space-y-2">
              {SITES.map((site) => (
                <div key={site} className="flex items-center gap-3">
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: SITE_COLOURS[site] }}
                  />
                  <label className="text-xs text-zinc-400 w-16">{SITE_CONFIGS[site].label}</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={limits[site]}
                    onChange={(e) => onLimitChange(site, e.target.value)}
                    className="flex-1 h-8 rounded-lg bg-zinc-800 border border-zinc-700 px-2.5 text-xs text-white outline-none focus:border-toki-500 focus:ring-1 focus:ring-toki-500/30 tabular-nums"
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* Warning threshold */}
          <Section title="Warning Threshold">
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={50}
                max={95}
                step={5}
                value={warningThreshold}
                onChange={(e) => setWarningPct(Number(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none bg-zinc-700 accent-toki-500"
              />
              <span className="text-xs font-mono text-zinc-300 w-10 text-right tabular-nums">
                {warningThreshold}%
              </span>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1">
              Show warning when usage exceeds this percentage
            </p>
          </Section>

          {/* Overlay toggle */}
          <Section title="Overlay">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-xs text-zinc-400">Show floating overlay on AI sites</span>
              <div className="relative">
                <input
                  type="checkbox"
                  checked={overlayEnabled}
                  onChange={(e) => setOverlay(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 rounded-full bg-zinc-700 peer-checked:bg-toki-500 transition-colors" />
                <div className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
              </div>
            </label>
          </Section>

          {/* Save button */}
          <button
            onClick={saveSettings}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 bg-toki-500 hover:bg-toki-400 text-white shadow-lg shadow-toki-500/20"
          >
            {saved ? "✓ Saved!" : "Save Settings"}
          </button>
        </div>
      )}

      {/* ── Footer ───────────────────────────────────────────────────── */}
      <div className="px-4 py-2 border-t border-zinc-800/50 text-center">
        <span className="text-[10px] text-zinc-600">
          Toki v{chrome.runtime.getManifest().version} · Resets at midnight
        </span>
      </div>
    </div>
  );
}

// ─── Tiny sub-components ──────────────────────────────────────────────────────

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${
        active
          ? "bg-zinc-800 text-white shadow-sm"
          : "text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
        {title}
      </h3>
      {children}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// ─── Mount ────────────────────────────────────────────────────────────────────

const el = document.getElementById("popup-root");
if (el) {
  createRoot(el).render(<Popup />);
}
