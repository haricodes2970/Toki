// EXTENSION FILE: src/content.ts
// ─────────────────────────────────────────────────────────────────────────────
// Content Script – Toki AI Usage Monitor  (Phase 5 – robust multi-site)
//
// Key improvements over Phase 3:
//  • Uses per-site SiteAdapter (selector chains, site-specific key logic)
//  • MutationObserver ignores Toki's own shadow host (#toki-overlay-root)
//  • Handles SPA navigation (history.pushState / popstate)
//  • Re-attaches listeners after every new-chat DOM remount
//  • extractText delegates to adapter (innerText vs .value)
// ─────────────────────────────────────────────────────────────────────────────

import type { SiteId, TokiMessage, UsageRecord } from "@/shared/types";
import { DEFAULT_LIMITS, OVERLAY_HOST_ID, STORAGE_KEYS } from "@/shared/constants";
import { mountOverlay } from "@/overlay/mountOverlay";
import { estimateTokens, ensureTokenizerReady } from "@/overlay/tokenizer";
import { getAdapter } from "@/adapters/index";
import type { SiteAdapter } from "@/adapters/types";

// ─── Public event detail types (imported by Overlay.tsx) ─────────────────────

export interface PromptUpdateDetail {
  tokens:        number;
  totalIfSent:   number;
  limitTokens:   number;
  pct:           number;
  isOverWarning: boolean;
  isOverDanger:  boolean;
}

export interface UsageRecordedDetail {
  tokens:  number;
  prompts: number;
  siteId:  SiteId;
}

/** Fired just before a prompt is submitted – Overlay decides whether to block */
export interface PreSendDetail {
  promptText:    string;
  draftTokens:   number;
  totalIfSent:   number;
  limitTokens:   number;
  pct:           number;
  isOverWarning: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WARNING_THRESHOLD  = 80;
const DANGER_THRESHOLD   = 90;
const SUBMIT_DEBOUNCE_MS = 60;
const MIN_CHARS          = 3;
const INPUT_WAIT_TIMEOUT = 10_000; // 10 s max wait for input to appear

// ─── Site Detection ───────────────────────────────────────────────────────────

function detectSite(): SiteId | null {
  const host = window.location.hostname;
  if (host.includes("chatgpt.com"))       return "chatgpt";
  if (host.includes("gemini.google.com")) return "gemini";
  if (host.includes("claude.ai"))         return "claude";
  if (host.includes("grok.x.ai"))         return "grok";
  if (host.includes("x.com") && window.location.pathname.startsWith("/i/grok")) return "grok";
  return null;
}

// ─── Entry ────────────────────────────────────────────────────────────────────

const siteId = detectSite();
if (!siteId) {
  console.warn("[Toki] Unrecognised site – aborting.");
} else {
  console.log(`[Toki] Initialising on "${siteId}"`);
  boot(siteId);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot(site: SiteId): Promise<void> {
  await Promise.all([waitForDOM(), ensureTokenizerReady()]);
  mountOverlay(site);

  const adapter = getAdapter(site);
  await attachAll(site, adapter);

  // SPA navigation: re-run attachment on every route change
  listenForNavigation(site, adapter);
}

// ─── Attach all listeners ─────────────────────────────────────────────────────

async function attachAll(site: SiteId, adapter: SiteAdapter): Promise<void> {
  // Submit listeners are document-level (delegation) – attach once only
  if (!(attachAll as { _submitAttached?: boolean })._submitAttached) {
    attachSubmitListeners(site, adapter);
    (attachAll as { _submitAttached?: boolean })._submitAttached = true;
  }

  // Input listener needs the actual element
  let inputEl = adapter.getInputEl();
  if (!inputEl) {
    inputEl = await waitForElement(adapter, INPUT_WAIT_TIMEOUT);
  }
  if (inputEl) {
    attachInputListener(inputEl, site, adapter);
  }

  // Respawn watcher for new-chat DOM remounts
  watchForInputRespawn(site, adapter);
}

// ─── SPA Navigation ───────────────────────────────────────────────────────────
// AI sites are SPAs – navigating to a new chat doesn't reload the page but
// does unmount + remount the prompt area. We listen to both popstate and
// the monkey-patched pushState to detect this.

function listenForNavigation(site: SiteId, adapter: SiteAdapter): void {
  let lastUrl = location.href;

  function onNav() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    console.log("[Toki] SPA navigation detected – re-attaching input listener.");
    // Small delay to let React re-render
    setTimeout(() => attachAll(site, adapter), 500);
  }

  window.addEventListener("popstate", onNav);

  // Patch pushState (used by React Router / Next.js)
  const origPush = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPush(...args);
    onNav();
  };
}

// ─── Input Listener ───────────────────────────────────────────────────────────

// Track which elements already have listeners to avoid duplicates
const attachedInputEls = new WeakSet<HTMLElement>();
let liveText = "";

function attachInputListener(el: HTMLElement, site: SiteId, adapter: SiteAdapter): void {
  if (attachedInputEls.has(el)) return;
  attachedInputEls.add(el);

  const onInput = () => {
    const text = adapter.extractText(el);
    liveText = text;
    if (text.length < MIN_CHARS) {
      void dispatchPromptUpdate(0, site);
      return;
    }
    void dispatchPromptUpdate(estimateTokens(text), site);
  };

  el.addEventListener("input", onInput);

  el.addEventListener("paste", () => {
    requestAnimationFrame(() => {
      const text = adapter.extractText(el);
      liveText = text;
      void dispatchPromptUpdate(estimateTokens(text), site);
    });
  });

  console.log(`[Toki] Input listener attached (${el.tagName}#${el.id || el.className.slice(0, 20)})`);
}

// ─── Submit Listeners (document-level delegation) ────────────────────────────

let lastRecordedText      = "";
let submitDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function attachSubmitListeners(site: SiteId, adapter: SiteAdapter): void {
  // Click – capture phase so we fire before the site's own handlers
  document.addEventListener("click", (e) => {
    // Ignore clicks inside our own overlay
    const target = e.target as Element | null;
    if (!target) return;
    if (target.closest(`#${OVERLAY_HOST_ID}`)) return;

    if (adapter.isSubmitClickEvent(e as MouseEvent)) {
      scheduleCapture(site, adapter);
    }
  }, true);

  // Keyboard
  document.addEventListener("keydown", (e) => {
    const target = e.target as Element | null;
    if (!target) return;
    if (target.closest(`#${OVERLAY_HOST_ID}`)) return;

    if (!adapter.isSubmitKeyEvent(e as KeyboardEvent)) return;

    // Only trigger if focus is in the prompt input
    const inputEl = adapter.getInputEl();
    if (!inputEl) return;
    if (inputEl.contains(target) || inputEl === target) {
      scheduleCapture(site, adapter);
    }
  }, true);
}

function scheduleCapture(site: SiteId, adapter: SiteAdapter): void {
  if (submitDebounceTimer) clearTimeout(submitDebounceTimer);
  submitDebounceTimer = setTimeout(() => {
    void interceptAndCapture(site, adapter);
    submitDebounceTimer = null;
  }, SUBMIT_DEBOUNCE_MS);
}

// ─── Pre-send Intercept ───────────────────────────────────────────────────────
// Fires toki:pre-send → waits for Overlay's decision → then records or aborts.

async function interceptAndCapture(site: SiteId, adapter: SiteAdapter): Promise<void> {
  const inputEl = adapter.getInputEl();
  const text    = liveText || (inputEl ? adapter.extractText(inputEl) : "");
  if (!text || text === lastRecordedText) return;

  const limit = await getDailyLimit(site);
  const used  = await getUsedToday(site);
  const draft = estimateTokens(text);
  const total = used + draft;
  const pct   = limit > 0 ? Math.min((total / limit) * 100, 100) : 0;

  const detail: PreSendDetail = {
    promptText:    text,
    draftTokens:   draft,
    totalIfSent:   total,
    limitTokens:   limit,
    pct,
    isOverWarning: pct >= WARNING_THRESHOLD,
  };

  // Dispatch pre-send event – Overlay will either confirm or cancel
  document.dispatchEvent(
    new CustomEvent<PreSendDetail>("toki:pre-send", { detail }),
  );

  // Wait for Overlay's decision (max 30 seconds in case user is reading tips)
  const confirmed = await waitForPreSendDecision(30_000);
  if (!confirmed) {
    console.log("[Toki] Pre-send cancelled by user.");
    return;
  }

  await captureAndRecord(site, adapter);
}

function waitForPreSendDecision(timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(true); // timeout = let it through
    }, timeoutMs);

    function onConfirm()  { cleanup(); resolve(true);  }
    function onCancel()   { cleanup(); resolve(false); }

    function cleanup() {
      clearTimeout(timer);
      document.removeEventListener("toki:pre-send-confirmed", onConfirm);
      document.removeEventListener("toki:pre-send-cancelled", onCancel);
    }

    document.addEventListener("toki:pre-send-confirmed", onConfirm, { once: true });
    document.addEventListener("toki:pre-send-cancelled", onCancel,  { once: true });
  });
}

// ─── Capture & Record ─────────────────────────────────────────────────────────

async function captureAndRecord(site: SiteId, adapter: SiteAdapter): Promise<void> {
  const inputEl = adapter.getInputEl();
  const text    = liveText || (inputEl ? adapter.extractText(inputEl) : "");

  if (!text || text === lastRecordedText) return;
  lastRecordedText = text;
  liveText = "";

  const tokens = estimateTokens(text);
  console.log(`[Toki] Capture: ~${tokens} tokens on "${site}"`);

  const record: UsageRecord = { siteId: site, tokens, prompts: 1, lastUsed: Date.now() };
  const message: TokiMessage = { type: "RECORD_USAGE", payload: record };

  try {
    await chrome.runtime.sendMessage(message);
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

async function dispatchPromptUpdate(draftTokens: number, site: SiteId): Promise<void> {
  const limit = await getDailyLimit(site);
  const used  = await getUsedToday(site);
  const total = used + draftTokens;
  const pct   = limit > 0 ? Math.min((total / limit) * 100, 100) : 0;

  document.dispatchEvent(
    new CustomEvent<PromptUpdateDetail>("toki:prompt-update", {
      detail: {
        tokens:        draftTokens,
        totalIfSent:   total,
        limitTokens:   limit,
        pct,
        isOverWarning: pct >= WARNING_THRESHOLD,
        isOverDanger:  pct >= DANGER_THRESHOLD,
      },
    }),
  );
}

// ─── MutationObserver – respawn watcher ──────────────────────────────────────
// Watches for the prompt input to be removed + re-added (new chat, navigation).
// Crucially filters out mutations inside #toki-overlay-root so we never
// re-trigger on our own DOM changes.

function watchForInputRespawn(site: SiteId, adapter: SiteAdapter): void {
  let cooldown = false;

  const mo = new MutationObserver((mutations) => {
    if (cooldown) return;

    // Skip if ALL changed nodes are inside our overlay
    const hasExternalMutation = mutations.some((m) =>
      !isInsideOverlay(m.target as Node),
    );
    if (!hasExternalMutation) return;

    const inputEl = adapter.getInputEl();
    if (!inputEl) return;
    if (attachedInputEls.has(inputEl)) return; // already have listener

    cooldown = true;
    attachInputListener(inputEl, site, adapter);
    setTimeout(() => { cooldown = false; }, 1500);
  });

  mo.observe(document.body, { childList: true, subtree: true });
}

function isInsideOverlay(node: Node): boolean {
  let current: Node | null = node;
  while (current) {
    if (current instanceof Element && current.id === OVERLAY_HOST_ID) return true;
    current = current.parentNode;
  }
  return false;
}

// ─── DOM Utilities ────────────────────────────────────────────────────────────

function waitForDOM(): Promise<void> {
  return new Promise((resolve) => {
    if (document.readyState !== "loading") { resolve(); return; }
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

function waitForElement(adapter: SiteAdapter, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const el = adapter.getInputEl();
    if (el) { resolve(el); return; }

    const timer = setTimeout(() => { mo.disconnect(); resolve(null); }, timeoutMs);

    const mo = new MutationObserver(() => {
      if (isInsideOverlay(document.body)) return; // safety guard
      const found = adapter.getInputEl();
      if (found) {
        clearTimeout(timer);
        mo.disconnect();
        resolve(found);
      }
    });

    mo.observe(document.body, { childList: true, subtree: true });
  });
}

// ─── Storage Helpers ──────────────────────────────────────────────────────────

let _cachedSettings: { limits: Record<string, number>; ts: number } | null = null;
const SETTINGS_CACHE_TTL = 5_000;

async function getDailyLimit(site: SiteId): Promise<number> {
  try {
    const now = Date.now();
    if (_cachedSettings && now - _cachedSettings.ts < SETTINGS_CACHE_TTL) {
      return _cachedSettings.limits[site] ?? DEFAULT_LIMITS[site];
    }
    const localData = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    let settings = localData[STORAGE_KEYS.SETTINGS];
    if (!settings) {
      const syncData = await chrome.storage.sync.get(STORAGE_KEYS.SETTINGS);
      settings = syncData[STORAGE_KEYS.SETTINGS];
    }
    if (settings?.limits) _cachedSettings = { limits: settings.limits, ts: now };
    return settings?.limits?.[site] ?? DEFAULT_LIMITS[site];
  } catch {
    return DEFAULT_LIMITS[site];
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes[STORAGE_KEYS.SETTINGS]) _cachedSettings = null;
});

async function getUsedToday(site: SiteId): Promise<number> {
  try {
    const data  = await chrome.storage.local.get(STORAGE_KEYS.USAGE);
    const usage = data[STORAGE_KEYS.USAGE] ?? {};
    const today = new Date().toISOString().slice(0, 10);
    return (usage[`${site}::${today}`]?.tokens ?? 0) as number;
  } catch {
    return 0;
  }
}
