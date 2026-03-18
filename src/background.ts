// EXTENSION FILE: src/background.ts
// ─────────────────────────────────────────────────────────────────────────────
// Service Worker – Toki AI Usage Monitor (MV3)
//
// Storage strategy:
//   chrome.storage.sync   → settings (limits, thresholds, prefs)
//                           Syncs across signed-in Chrome instances.
//   chrome.storage.local  → usage records, history
//                           High-write, device-local.
//   Both stores hold a copy of SETTINGS so content scripts can read from
//   local (faster) while the popup writes to sync (durable).
//
// Daily reset:
//   chrome.alarms fires at midnight local time.  On startup we verify the
//   alarm exists (service workers can be killed at any time in MV3).
// ─────────────────────────────────────────────────────────────────────────────

import type { TokiMessage, TokiSettings, UsageRecord, SiteId, DailyLimits } from "@/shared/types";
import { DAILY_RESET_ALARM, STORAGE_KEYS, DEFAULT_LIMITS } from "@/shared/constants";

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    console.log("[Toki] Extension installed – initialising storage.");
    await initStorage();
  } else if (details.reason === "update") {
    console.log("[Toki] Extension updated to", chrome.runtime.getManifest().version);
    await migrateStorage();
  }

  await ensureAlarm();
});

// Service worker can restart at any time – re-register the alarm on startup
chrome.runtime.onStartup.addListener(async () => {
  console.log("[Toki] Browser startup – verifying alarm.");
  await ensureAlarm();
  await checkDateRollover();
});

// ─── Alarm ────────────────────────────────────────────────────────────────────

async function ensureAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(DAILY_RESET_ALARM);
  if (!existing) {
    await chrome.alarms.create(DAILY_RESET_ALARM, {
      when: nextMidnightMs(),
      periodInMinutes: 24 * 60,
    });
    console.log("[Toki] Daily reset alarm registered for", new Date(nextMidnightMs()).toLocaleTimeString());
  }
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === DAILY_RESET_ALARM) {
    console.log("[Toki] Daily reset alarm fired.");
    await resetDailyUsage();
  }
});

// ─── Sync → Local mirror ─────────────────────────────────────────────────────
// When the user changes settings in the popup (written to sync), mirror the
// change into local so content scripts can read it without awaiting sync.

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[STORAGE_KEYS.SETTINGS]) {
    const newSettings = changes[STORAGE_KEYS.SETTINGS].newValue;
    chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: newSettings });
    console.log("[Toki] Settings synced → local mirror updated.");
  }
});

// ─── Message Dispatcher ───────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: TokiMessage, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err: unknown) => {
        console.error("[Toki] Message handler error:", err);
        sendResponse({ ok: false, error: String(err) });
      });
    return true; // keep channel open for async
  },
);

async function handleMessage(message: TokiMessage): Promise<unknown> {
  switch (message.type) {
    case "RECORD_USAGE":
      return recordUsage(message.payload);

    case "GET_USAGE":
      return getUsage(message.payload.siteId);

    case "GET_SETTINGS":
      return getSettings();

    case "SET_SETTINGS":
      return setSettings(message.payload);

    case "RESET_USAGE":
      return resetDailyUsage();

    default:
      console.warn("[Toki] Unknown message type:", (message as { type: string }).type);
      return { ok: false, error: "unknown_message_type" };
  }
}

// ─── Init Storage ─────────────────────────────────────────────────────────────

async function initStorage(): Promise<void> {
  const defaultSettings: TokiSettings = {
    limits: { ...DEFAULT_LIMITS },
    warningThreshold: 0.8,
    overlayPosition:  "top-right",
    overlayEnabled:   true,
  };

  // Write defaults to both sync (durable) and local (fast reads)
  const syncData = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  if (!syncData[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: defaultSettings });
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: syncData[STORAGE_KEYS.SETTINGS] ?? defaultSettings,
    [STORAGE_KEYS.USAGE]:    {},
    [STORAGE_KEYS.HISTORY]:  [],
  });
}

async function migrateStorage(): Promise<void> {
  // Future: handle schema changes between versions
  // For now, ensure sync → local mirror is consistent
  const syncData = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  if (syncData[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: syncData[STORAGE_KEYS.SETTINGS],
    });
  }
  console.log("[Toki] Storage migration complete.");
}

// ─── Record Usage ─────────────────────────────────────────────────────────────
// Storage shape:  { "chatgpt::2026-03-18": { siteId, tokens, prompts, lastUsed, date } }

async function recordUsage(record: UsageRecord): Promise<{ ok: boolean }> {
  const data  = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
  const usage = (data[STORAGE_KEYS.USAGE] ?? {}) as Record<string, UsageRecord>;
  const today = todayKey();
  const key   = `${record.siteId}::${today}`;

  const existing = usage[key];
  if (existing) {
    existing.tokens   += record.tokens;
    existing.prompts  += record.prompts;
    existing.lastUsed  = record.lastUsed;
  } else {
    usage[key] = { ...record, date: today };
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });

  // Broadcast to popup / overlay
  chrome.runtime.sendMessage({ type: "USAGE_UPDATED", payload: usage[key] }).catch(() => {
    // No listeners open – safe to ignore
  });

  return { ok: true };
}

// ─── Get Usage ────────────────────────────────────────────────────────────────

async function getUsage(siteId?: SiteId): Promise<UsageRecord[]> {
  const data  = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
  const usage = (data[STORAGE_KEYS.USAGE] ?? {}) as Record<string, UsageRecord>;
  const today = todayKey();

  return Object.entries(usage)
    .filter(([key]) => {
      const isToday    = key.endsWith(`::${today}`);
      const matchesSite = siteId ? key.startsWith(`${siteId}::`) : true;
      return isToday && matchesSite;
    })
    .map(([, record]) => record);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function getSettings(): Promise<TokiSettings> {
  // Try sync first (canonical), fall back to local
  const syncData  = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
  const localData = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);

  return (syncData[STORAGE_KEYS.SETTINGS]
       ?? localData[STORAGE_KEYS.SETTINGS]
       ?? {
            limits: { ...DEFAULT_LIMITS },
            warningThreshold: 0.8,
            overlayPosition:  "top-right",
            overlayEnabled:   true,
          }) as TokiSettings;
}

async function setSettings(partial: Partial<TokiSettings>): Promise<{ ok: boolean }> {
  const current = await getSettings();

  // Deep-merge limits so updating one site doesn't nuke the others
  const merged: TokiSettings = {
    ...current,
    ...partial,
    limits: {
      ...current.limits,
      ...(partial.limits as Partial<DailyLimits> | undefined),
    },
  };

  // Write to both stores
  await chrome.storage.sync.set({ [STORAGE_KEYS.SETTINGS]: merged });
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: merged });

  return { ok: true };
}

// ─── Daily Reset ──────────────────────────────────────────────────────────────

async function resetDailyUsage(): Promise<{ ok: boolean }> {
  const data    = await chrome.storage.local.get([STORAGE_KEYS.USAGE, STORAGE_KEYS.HISTORY]);
  const usage   = (data[STORAGE_KEYS.USAGE] ?? {}) as Record<string, UsageRecord>;
  const history = (data[STORAGE_KEYS.HISTORY] ?? []) as UsageRecord[];

  const records = Object.values(usage);
  if (records.length > 0) {
    history.push(...records);
    // Cap at 90 days × 4 sites = 360 records max
    const trimmed = history.slice(-360);
    await chrome.storage.local.set({
      [STORAGE_KEYS.USAGE]:   {},
      [STORAGE_KEYS.HISTORY]: trimmed,
    });
  } else {
    // No usage today — just clear the bucket
    await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: {} });
  }

  console.log("[Toki] Daily usage reset complete. Archived", records.length, "records.");
  return { ok: true };
}

// ─── Date Rollover Check ──────────────────────────────────────────────────────
// If the browser was closed overnight and the alarm missed its window,
// detect stale usage on startup and reset.

async function checkDateRollover(): Promise<void> {
  const data  = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
  const usage = (data[STORAGE_KEYS.USAGE] ?? {}) as Record<string, UsageRecord>;
  const today = todayKey();

  const hasStaleEntries = Object.keys(usage).some((key) => !key.endsWith(`::${today}`));
  if (hasStaleEntries) {
    console.log("[Toki] Stale usage detected (browser was closed overnight) – resetting.");
    await resetDailyUsage();
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function nextMidnightMs(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
}
