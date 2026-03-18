// EXTENSION FILE: src/dashboard/Dashboard.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Full-page usage dashboard. Opened via:
//   chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/dashboard.html") })
// (wired up in Phase 8 from the popup "View full dashboard" button)
//
// Sections:
//  1. Header – title, reset timer, "open on AI site" shortcut
//  2. Today's usage – per-site bars with token counts
//  3. Weekly bar chart – recharts BarChart, one bar per day × per site
//  4. Stats strip – total this month, current streak, avg per day
//  5. History list – last 14 days, expandable
//  6. Export CSV button
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import "./dashboard.css";
import type { SiteId, UsageRecord } from "@/shared/types";
import { DEFAULT_LIMITS, STORAGE_KEYS } from "@/shared/constants";

// ─── Constants ────────────────────────────────────────────────────────────────

const SITES: SiteId[]                   = ["chatgpt", "gemini", "claude", "grok"];
const SITE_LABELS: Record<SiteId, string> = {
  chatgpt: "ChatGPT", gemini: "Gemini", claude: "Claude", grok: "Grok",
};
const SITE_COLOURS: Record<SiteId, string> = {
  chatgpt: "#22c55e", gemini: "#3b82f6", claude: "#f97316", grok: "#a855f7",
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayData {
  date:    string;                        // "YYYY-MM-DD"
  label:   string;                        // "Mon", "Tue" …
  chatgpt: number;
  gemini:  number;
  claude:  number;
  grok:    number;
  total:   number;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const [todayUsage, setTodayUsage]   = useState<Record<SiteId, number>>({ chatgpt: 0, gemini: 0, claude: 0, grok: 0 });
  const [limits, setLimits]           = useState<Record<SiteId, number>>({ ...DEFAULT_LIMITS });
  const [history, setHistory]         = useState<UsageRecord[]>([]);
  const [resetTime, setResetTime]     = useState("--:--:--");
  const [showAllHistory, setShowAll]  = useState(false);

  // ── Load data ───────────────────────────────────────────────────────────
  useEffect(() => {
    // Settings
    chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (d) => {
      const s = d[STORAGE_KEYS.SETTINGS];
      if (s?.limits) setLimits(s.limits);
    });

    // Today's usage
    chrome.storage.local.get(STORAGE_KEYS.USAGE, (d) => {
      const raw = (d[STORAGE_KEYS.USAGE] ?? {}) as Record<string, UsageRecord>;
      const today = todayKey();
      const u: Record<SiteId, number> = { chatgpt: 0, gemini: 0, claude: 0, grok: 0 };
      for (const [key, rec] of Object.entries(raw)) {
        if (!key.endsWith(`::${today}`)) continue;
        const site = key.split("::")[0] as SiteId;
        u[site] += rec.tokens;
      }
      setTodayUsage(u);
    });

    // History (past records, archived at midnight)
    chrome.storage.local.get(STORAGE_KEYS.HISTORY, (d) => {
      setHistory((d[STORAGE_KEYS.HISTORY] ?? []) as UsageRecord[]);
    });
  }, []);

  // ── Reset countdown ─────────────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now = new Date();
      const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const d   = mid.getTime() - now.getTime();
      setResetTime(
        `${pad(Math.floor(d / 3_600_000))}:${pad(Math.floor((d % 3_600_000) / 60_000))}:${pad(Math.floor((d % 60_000) / 1000))}`,
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── Derived: weekly chart data (last 7 days incl. today) ────────────────
  const weekData = useMemo<DayData[]>(() => {
    const today = todayKey();
    const days: DayData[] = Array.from({ length: 7 }, (_, i) => {
      const d   = new Date();
      d.setDate(d.getDate() - (6 - i));
      const iso = d.toISOString().slice(0, 10);
      return {
        date:    iso,
        label:   iso === today ? "Today" : d.toLocaleDateString("en", { weekday: "short" }),
        chatgpt: 0, gemini: 0, claude: 0, grok: 0, total: 0,
      };
    });

    // Fill from history
    for (const rec of history) {
      const day = days.find((d) => d.date === rec.date);
      if (day) { day[rec.siteId] += rec.tokens; day.total += rec.tokens; }
    }

    // Fill today from live usage
    const todayDay = days.find((d) => d.date === today);
    if (todayDay) {
      for (const site of SITES) {
        todayDay[site] = todayUsage[site];
        todayDay.total += todayUsage[site];
      }
    }

    return days;
  }, [history, todayUsage]);

  // ── Derived: monthly total + streak ─────────────────────────────────────
  const { monthTotal, streak } = useMemo(() => {
    const month = todayKey().slice(0, 7); // "YYYY-MM"
    let total = 0;
    const activeDays = new Set<string>();

    for (const rec of history) {
      if (rec.date?.startsWith(month)) { total += rec.tokens; if (rec.date) activeDays.add(rec.date); }
    }
    // Add today
    total += Object.values(todayUsage).reduce((a, b) => a + b, 0);
    activeDays.add(todayKey());

    // Streak: consecutive days backwards from today
    let s = 0;
    const d = new Date();
    while (activeDays.has(d.toISOString().slice(0, 10))) {
      s++;
      d.setDate(d.getDate() - 1);
    }

    return { monthTotal: total, streak: s };
  }, [history, todayUsage]);

  // ── History list (last 14 unique days across all sites) ─────────────────
  const historyByDay = useMemo(() => {
    const map = new Map<string, Record<SiteId, number>>();
    for (const rec of history) {
      if (!rec.date) continue;
      if (!map.has(rec.date)) map.set(rec.date, { chatgpt: 0, gemini: 0, claude: 0, grok: 0 });
      map.get(rec.date)![rec.siteId] += rec.tokens;
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, showAllHistory ? 30 : 7);
  }, [history, showAllHistory]);

  // ── CSV Export ──────────────────────────────────────────────────────────
  const exportCSV = useCallback(() => {
    const rows = ["date,site,tokens,prompts"];
    for (const rec of history) {
      rows.push(`${rec.date ?? ""},${rec.siteId},${rec.tokens},${rec.prompts}`);
    }
    // Add today's live usage
    const today = todayKey();
    for (const site of SITES) {
      if (todayUsage[site] > 0) rows.push(`${today},${site},${todayUsage[site]},`);
    }

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `toki-usage-${today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [history, todayUsage]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚡</span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Toki Dashboard</h1>
            <p className="text-xs text-zinc-500">AI Usage Monitor</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-zinc-500">Resets in</div>
          <div className="font-mono text-lg font-semibold tabular-nums text-toki-400">
            {resetTime}
          </div>
        </div>
      </div>

      {/* ── Stats strip ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="This Month" value={fmt(monthTotal)} sub="tokens" />
        <StatCard label="Current Streak" value={`${streak}d`} sub="active days" />
        <StatCard
          label="7-day Avg"
          value={fmt(Math.round(weekData.reduce((a, d) => a + d.total, 0) / 7))}
          sub="tokens/day"
        />
      </div>

      {/* ── Today's usage bars ──────────────────────────────────────────── */}
      <Section title="Today's Usage">
        <div className="space-y-3">
          {SITES.map((site) => {
            const pct = limits[site] > 0
              ? Math.min((todayUsage[site] / limits[site]) * 100, 100)
              : 0;
            return (
              <div key={site}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">{SITE_LABELS[site]}</span>
                  <span className="text-zinc-500 tabular-nums">
                    {fmt(todayUsage[site])} / {fmt(limits[site])}
                    <span className="ml-2 text-zinc-600">({Math.round(pct)}%)</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background:
                        pct >= 90 ? "#ef4444" : pct >= 80 ? "#f59e0b" : SITE_COLOURS[site],
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Weekly bar chart ────────────────────────────────────────────── */}
      <Section title="Last 7 Days">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={weekData} barSize={14} barGap={2}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#71717a", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => fmt(v)}
              tick={{ fill: "#71717a", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: "#18181b",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: "#e4e4e7", marginBottom: 4 }}
              formatter={(v: number, name: string) => [fmt(v), SITE_LABELS[name as SiteId] ?? name]}
            />
            <Legend
              formatter={(v: string) => SITE_LABELS[v as SiteId] ?? v}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
            {SITES.map((site) => (
              <Bar key={site} dataKey={site} stackId="a" fill={SITE_COLOURS[site]} radius={site === "grok" ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Section>

      {/* ── History list ────────────────────────────────────────────────── */}
      <Section title="History">
        <div className="space-y-1.5">
          {historyByDay.length === 0 && (
            <p className="text-sm text-zinc-600 text-center py-4">No history yet.</p>
          )}
          {historyByDay.map(([date, data]) => (
            <div key={date} className="flex items-center gap-3 rounded-lg bg-zinc-900/50 px-3 py-2">
              <span className="text-xs text-zinc-500 w-24 tabular-nums">{date}</span>
              <div className="flex gap-3 flex-1">
                {SITES.map((site) =>
                  data[site] > 0 ? (
                    <span key={site} className="text-xs tabular-nums" style={{ color: SITE_COLOURS[site] }}>
                      {SITE_LABELS[site]}: {fmt(data[site])}
                    </span>
                  ) : null,
                )}
              </div>
              <span className="text-xs text-zinc-600 tabular-nums">
                {fmt(Object.values(data).reduce((a, b) => a + b, 0))} total
              </span>
            </div>
          ))}
        </div>

        {!showAllHistory && historyByDay.length >= 7 && (
          <button
            onClick={() => setShowAll(true)}
            className="w-full mt-2 text-xs text-zinc-500 hover:text-zinc-300 py-1.5 transition-colors"
          >
            Show more ↓
          </button>
        )}
      </Section>

      {/* ── Export ─────────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium text-zinc-300 hover:text-white transition-colors"
        >
          ↓ Export CSV
        </button>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-zinc-900 p-4 text-center">
      <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-2xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-[10px] text-zinc-600 mt-0.5">{sub}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h2>
      {children}
    </div>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function pad(n: number): string { return String(n).padStart(2, "0"); }
function todayKey(): string     { return new Date().toISOString().slice(0, 10); }

// ─── Mount ────────────────────────────────────────────────────────────────────

const el = document.getElementById("dashboard-root");
if (el) createRoot(el).render(<Dashboard />);
