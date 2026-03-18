// EXTENSION FILE: src/content.ts
// ─────────────────────────────────────────────────────────────────────────────
// Content Script – Toki AI Usage Monitor
// Injected into: chatgpt.com | gemini.google.com | claude.ai | grok.x.ai
//
// Pipeline per keystroke:
//   user types → estimateTokens(text) → dispatch toki:prompt-update →
//   Overlay renders live count + warning
//
// Pipeline on submit:
//   submit detected → captureAndRecord() → sendMessage(RECORD_USAGE) →
//   background persists to storage → dispatch toki:usage-recorded
// ─────────────────────────────────────────────────────────────────────────────

import type { SiteId, TokiMessage, UsageRecord } from "@/shared/types";
import { SITE_CONFIGS, DEFAULT_LIMITS, STORAGE_KEYS } from "@/shared/constants";
import { mountOverlay } from "@/overlay/mountOverlay";
import { estimateTokens, ensureTokenizerReady } from "@/overlay/tokenizer";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Fired when the user is actively typing – carries live estimate */
export interface PromptUpdateDetail {
  tokens:        number;   // estimate for current draft
  totalIfSent:   number;   // existing usage + this prompt
  limitTokens:   number;   // user's daily cap
  pct:           number;   // totalIfSent / limitTokens * 100
  isOverWarning: boolean;  // pct > WARNING_THRESHOLD
  isOverDanger:  boolean;  // pct > DANGER_THRESHOLD
}

/** Fired after a prompt is recorded to storage */
export interface UsageRecordedDetail {
  tokens:  number;
  prompts: number;
  siteId:  SiteId;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WARNING_THRESHOLD = 80;  // % – yellow warning
const DANGER_THRESHOLD  = 90;  // % – red danger

// How long to wait after a submit event before trying to read the textarea
// (most AI sites clear the input ~100ms after click/enter)
const SUBMIT_DEBOUNCE_MS = 60;

// Minimum chars to bother estimating (avoids noise from arrow-key presses)
const MIN_CHARS = 3;

// ─── Site Detection ───────────────────────────────────────────────────────────

function detectSite(): SiteId | null {
  const host = window.location.hostname;
  if (host.includes("chatgpt.com"))        return "chatgpt";
  if (host.includes("gemini.google.com"))  return "gemini";
  if (host.includes("claude.ai"))          return "claude";
  if (host.includes("grok.x.ai"))          return "grok";
  if (host.includes("x.com") && window.location.pathname.startsWith("/i/grok")) return "grok";
  return null;
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

const siteId = detectSite();

if (!siteId) {
  console.warn("[Toki] Unrecognised site – aborting.");
} else {
  console.log(`[Toki] Initialising on "${siteId}"`);
  boot(siteId);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot(site: SiteId): Promise<void> {
  // Wait for DOM + WASM in parallel
  await Promise.all([waitForDOM(), ensureTokenizerReady()]);

  mountOverlay(site);
  await attachObservers(site);
}

// ─── DOM Ready ───────────────────────────────────────────────────────────────

function waitForDOM(): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState !== "loading") { resolve(); return; }
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

// ─── Observer Setup ───────────────────────────────────────────────────────────
// Some AI sites mount their textarea asynchronously (React hydration, route
// changes). We use a MutationObserver to detect when the target input appears,
// then attach the actual event listeners.

async function attachObservers(site: SiteId): Promise<void> {
  const config = SITE_CONFIGS[site];

  // Try immediately first
  if (tryAttachInputListeners(site, config.inputSelector)) return;

  // Fallback: wait for the input to appear in the DOM
  await waitForElement(config.inputSelector, 8000);
  tryAttachInputListeners(site, config.inputSelector);

  // Also watch for SPA navigation re-mounting the input (e.g. new chat)
  watchForInputRespawn(site);
}

/**
 * Attaches input + submit listeners once the target element exists.
 * Returns true if the element was found and listeners attached.
 */
function tryAttachInputListeners(site: SiteId, inputSelector: string): boolean {
  const el = document.querySelector(inputSelector);
  if (!el) return false;

  attachInputListener(el as HTMLElement, site);
  attachSubmitListeners(site);
  console.log(`[Toki] Listeners attached for "${site}".`);
  return true;
}

/**
 * MutationObserver that re-attaches listeners when the AI site unmounts and
 * remounts the prompt area (e.g. after starting a new conversation).
 */
function watchForInputRespawn(site: SiteId): void {
  const config = SITE_CONFIGS[site];
  let attached = false;

  const mo = new MutationObserver(() => {
    if (attached) return;
    const el = document.querySelector(config.inputSelector);
    if (!el) return;
    attached = true;
    attachInputListener(el as HTMLElement, site);
    // Don't stop the observer – a new chat could remount the input
    setTimeout(() => { attached = false; }, 2000);
  });

  mo.observe(document.body, { childList: true, subtree: true });
}

// ─── Input Listener ───────────────────────────────────────────────────────────

let liveText = "";

function attachInputListener(el: HTMLElement, site: SiteId): void {
  // `input` fires on both <textarea> and contenteditable <div>
  el.addEventListener("input", () => {
    const text = extractText(el);
    liveText = text;

    if (text.length < MIN_CHARS) {
      // Draft cleared – reset the overlay warning state
      dispatchPromptUpdate(0, site);
      return;
    }

    const tokens = estimateTokens(text);
    dispatchPromptUpdate(tokens, site);
  });

  // Also handle paste – `input` fires for paste too, but explicit just in case
  el.addEventListener("paste", () => {
    // Allow paste to land in DOM before reading
    requestAnimationFrame(() => {
      const text = extractText(el);
      liveText = text;
      dispatchPromptUpdate(estimateTokens(text), site);
    });
  });
}

// ─── Submit Listeners ─────────────────────────────────────────────────────────

let lastRecordedText = "";
let submitDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function attachSubmitListeners(site: SiteId): void {
  const config = SITE_CONFIGS[site];

  // Strategy A – click on the send button (capture phase beats stopPropagation)
  document.addEventListener("click", (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    if (target.closest(config.submitSelector)) {
      scheduleCapture(site);
    }
  }, true);

  // Strategy B – Enter key inside the prompt input
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.ctrlKey) return;
    const target = e.target as Element | null;
    if (!target) return;
    if (target.closest(config.inputSelector)) {
      scheduleCapture(site);
    }
  }, true);
}

/**
 * Debounced capture: we schedule slightly after the event fires because
 * some sites dispatch their own handlers that clear the textarea first.
 * We use `liveText` (last known draft) to avoid reading an empty field.
 */
function scheduleCapture(site: SiteId): void {
  if (submitDebounceTimer) clearTimeout(submitDebounceTimer);
  submitDebounceTimer = setTimeout(() => {
    captureAndRecord(site);
    submitDebounceTimer = null;
  }, SUBMIT_DEBOUNCE_MS);
}

// ─── Capture & Record ─────────────────────────────────────────────────────────

async function captureAndRecord(site: SiteId): Promise<void> {
  const config = SITE_CONFIGS[site];
  const el     = document.querySelector<HTMLElement>(config.inputSelector);

  // Prefer the live draft text; fall back to reading the DOM directly
  let text = liveText || (el ? extractText(el) : "");

  if (!text || text === lastRecordedText) return;
  lastRecordedText = text;
  liveText = ""; // reset draft after capture

  const tokens = estimateTokens(text);
  console.log(`[Toki] Submitting ~${tokens} tokens`);

  const record: UsageRecord = {
    siteId,
    tokens,
    prompts:  1,
    lastUsed: Date.now(),
  };

  const message: TokiMessage = { type: "RECORD_USAGE", payload: record };

  try {
    await chrome.runtime.sendMessage(message);
    // Tell the overlay the prompt was sent so it can reset the live counter
    document.dispatchEvent(
      new CustomEvent<UsageRecordedDetail>("toki:usage-recorded", {
        detail: { tokens, prompts: 1, siteId: site },
      }),
    );
  } catch (err) {
    console.error("[Toki] Failed to record usage:", err);
  }
}

// ─── Live Token Dispatch ──────────────────────────────────────────────────────

/** Reads current stored usage, computes totals, fires toki:prompt-update */
async function dispatchPromptUpdate(draftTokens: number, site: SiteId): Promise<void> {
  const limit = await getDailyLimit(site);
  const used  = await getUsedToday(site);

  const totalIfSent   = used + draftTokens;
  const pct           = limit > 0 ? Math.min((totalIfSent / limit) * 100, 100) : 0;
  const isOverWarning = pct >= WARNING_THRESHOLD;
  const isOverDanger  = pct >= DANGER_THRESHOLD;

  const detail: PromptUpdateDetail = {
    tokens: draftTokens,
    totalIfSent,
    limitTokens: limit,
    pct,
    isOverWarning,
    isOverDanger,
  };

  document.dispatchEvent(
    new CustomEvent<PromptUpdateDetail>("toki:prompt-update", { detail }),
  );
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────
// Settings are read from chrome.storage.local (fast, mirrored from sync by
// background.ts).  Usage is always in local storage, keyed as "site::YYYY-MM-DD".

// Cache settings in-memory to avoid hitting storage on every keystroke
let _cachedSettings: { limits: Record<string, number>; ts: number } | null = null;
const SETTINGS_CACHE_TTL = 5_000; // 5 seconds

async function getDailyLimit(site: SiteId): Promise<number> {
  try {
    const now = Date.now();
    if (_cachedSettings && now - _cachedSettings.ts < SETTINGS_CACHE_TTL) {
      return _cachedSettings.limits[site] ?? DEFAULT_LIMITS[site];
    }

    // Try local first (faster), then sync as fallback
    const localData = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    let settings = localData[STORAGE_KEYS.SETTINGS];

    if (!settings) {
      const syncData = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
      settings = syncData[STORAGE_KEYS.SETTINGS];
    }

    if (settings?.limits) {
      _cachedSettings = { limits: settings.limits, ts: now };
    }

    return settings?.limits?.[site] ?? DEFAULT_LIMITS[site];
  } catch {
    return DEFAULT_LIMITS[site];
  }
}

// Invalidate cache when settings change (popup saves new limits)
chrome.storage.onChanged.addListener((changes, area) => {
  if (changes[STORAGE_KEYS.SETTINGS]) {
    _cachedSettings = null;
  }
});

async function getUsedToday(site: SiteId): Promise<number> {
  try {
    const data  = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
    const usage = data[STORAGE_KEYS.USAGE] ?? {};
    const today = new Date().toISOString().slice(0, 10);
    const key   = `${site}::${today}`;
    return (usage[key]?.tokens ?? 0) as number;
  } catch {
    return 0;
  }
}

// ─── DOM Text Extraction ──────────────────────────────────────────────────────

/**
 * Extracts the text content from either a <textarea> or a contenteditable node.
 * Normalises whitespace so token estimates are stable.
 */
function extractText(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement) {
    return el.value.trim();
  }
  // contenteditable – textContent strips HTML tags
  return (el.textContent ?? "").trim();
}

// ─── DOM Wait Utility ─────────────────────────────────────────────────────────

function waitForElement(selector: string, timeoutMs: number): Promise<Element | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) { resolve(existing); return; }

    const timer = setTimeout(() => {
      mo.disconnect();
      resolve(null);
    }, timeoutMs);

    const mo = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        clearTimeout(timer);
        mo.disconnect();
        resolve(el);
      }
    });

    mo.observe(document.body, { childList: true, subtree: true });
  });
}
