// EXTENSION FILE: src/background.ts
// Service Worker – Toki AI Usage Monitor (MV3)
// Runs as a persistent-free background context; use chrome.alarms to stay alive.

import type { TokiMessage, UsageRecord, SiteId } from "@/shared/types";
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

  // Register daily reset alarm (fires at midnight local time each day)
  await chrome.alarms.create(DAILY_RESET_ALARM, {
    when: nextMidnightMs(),
    periodInMinutes: 24 * 60,
  });
});

chrome.runtime.onStartup.addListener(() => {
  console.log("[Toki] Browser started – service worker alive.");
});

// ─── Alarm Handler ────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === DAILY_RESET_ALARM) {
    console.log("[Toki] Daily reset fired.");
    await resetDailyUsage();
  }
});

// ─── Message Dispatcher ───────────────────────────────────────────────────────
// Content scripts communicate via chrome.runtime.sendMessage.
// Each message has a `type` discriminant (TokiMessage union).

chrome.runtime.onMessage.addListener(
  (message: TokiMessage, sender, sendResponse) => {
    // We need to call async logic, so kick off a Promise and return true
    // to keep the channel open for sendResponse.
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err: unknown) => {
        console.error("[Toki] Message handler error:", err);
        sendResponse({ ok: false, error: String(err) });
      });

    return true; // keeps the message channel open for async response
  },
);

// ─── Message Handlers ─────────────────────────────────────────────────────────

async function handleMessage(
  message: TokiMessage,
  sender: chrome.runtime.MessageSender,
): Promise<unknown> {
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
      // Exhaustive check – TypeScript will flag unhandled cases at compile time
      console.warn("[Toki] Unknown message type:", (message as { type: string }).type);
      return { ok: false, error: "unknown_message_type" };
  }
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

async function initStorage(): Promise<void> {
  const existing = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  if (!existing[STORAGE_KEYS.SETTINGS]) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SETTINGS]: {
        limits: DEFAULT_LIMITS,
        warningThreshold: 0.8, // warn at 80% usage
        overlayPosition: "bottom-right",
        overlayEnabled: true,
      },
      [STORAGE_KEYS.USAGE]: {},
      [STORAGE_KEYS.HISTORY]: [],
    });
  }
}

async function migrateStorage(): Promise<void> {
  // Placeholder for future schema migrations
  console.log("[Toki] Storage migration check complete.");
}

async function recordUsage(record: UsageRecord): Promise<{ ok: boolean }> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
  const usage: Record<string, UsageRecord> = data[STORAGE_KEYS.USAGE] ?? {};

  const today = todayKey();
  const key = `${record.siteId}::${today}`;

  const existing = usage[key];
  if (existing) {
    existing.tokens   += record.tokens;
    existing.prompts  += record.prompts;
    existing.lastUsed  = record.lastUsed;
  } else {
    usage[key] = { ...record, date: today };
  }

  await chrome.storage.local.set({ [STORAGE_KEYS.USAGE]: usage });

  // Notify any open popups about the update
  chrome.runtime.sendMessage({ type: "USAGE_UPDATED", payload: usage[key] }).catch(() => {
    // Popup may not be open – safe to ignore
  });

  return { ok: true };
}

async function getUsage(siteId?: SiteId): Promise<UsageRecord[]> {
  const data  = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
  const usage: Record<string, UsageRecord> = data[STORAGE_KEYS.USAGE] ?? {};
  const today = todayKey();

  return Object.entries(usage)
    .filter(([key]) => {
      const inToday  = key.endsWith(`::${today}`);
      const matchSite = siteId ? key.startsWith(`${siteId}::`) : true;
      return inToday && matchSite;
    })
    .map(([, record]) => record);
}

async function getSettings(): Promise<unknown> {
  const data = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return data[STORAGE_KEYS.SETTINGS];
}

async function setSettings(settings: unknown): Promise<{ ok: boolean }> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
  return { ok: true };
}

async function resetDailyUsage(): Promise<{ ok: boolean }> {
  // Archive today's data before wiping (keeps history intact)
  const data  = await chrome.storage.local.get([STORAGE_KEYS.USAGE, STORAGE_KEYS.HISTORY]);
  const usage: Record<string, UsageRecord> = data[STORAGE_KEYS.USAGE] ?? {};
  const history: UsageRecord[]             = data[STORAGE_KEYS.HISTORY] ?? [];

  const todayRecords = Object.values(usage);
  if (todayRecords.length > 0) {
    history.push(...todayRecords);
    // Keep only the last 90 days of history to avoid unbounded growth
    const trimmed = history.slice(-90 * 4); // up to 4 sites × 90 days
    await chrome.storage.local.set({
      [STORAGE_KEYS.USAGE]:   {},
      [STORAGE_KEYS.HISTORY]: trimmed,
    });
  }

  console.log("[Toki] Daily usage reset complete.");
  return { ok: true };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function todayKey(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function nextMidnightMs(): number {
  const now   = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return midnight.getTime();
}
