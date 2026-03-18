// EXTENSION FILE: src/shared/constants.ts

import type { DailyLimits, SiteConfig, SiteId, SitePlan } from "./types";

// ─── Storage Keys ─────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  USAGE:      "toki_usage",
  HISTORY:    "toki_history",
  SETTINGS:   "toki_settings",
  SITE_STATE: "toki_site_state",
} as const;

// ─── Alarms ───────────────────────────────────────────────────────────────────

export const DAILY_RESET_ALARM = "toki_daily_reset";

// ─── Overlay DOM ID ───────────────────────────────────────────────────────────
// Used to exclude Toki's own shadow host from MutationObserver callbacks.

export const OVERLAY_HOST_ID = "toki-overlay-root";

// ─── Default Limits (tokens / day per site) ───────────────────────────────────

export const DEFAULT_LIMITS: DailyLimits = {
  chatgpt:  80_000,  // ChatGPT Plus – 160 msg/3h rolling ≈ 80k tokens/day
  gemini:   60_000,  // Gemini free tier (Flash is very generous)
  claude:  100_000,  // Claude Pro – Anthropic "~5× free" (March 2026)
  grok:     40_000,  // X Premium baseline
};

// ─── Reset types ──────────────────────────────────────────────────────────────

export const RESET_TYPES = ["daily", "rolling"] as const;

// ─── Heuristics ───────────────────────────────────────────────────────────────
// Fallback average used when a user has no recorded history yet.

export const AVG_TOKENS_PER_MSG = 1_000;

// ─── Plan presets (tokens / day, March 2026 estimates) ────────────────────────
// Maps site → plan name → daily token budget.
// "custom" plan inherits whatever the user typed in the limit field.
//
// Notes:
//   ChatGPT Plus   – 160 GPT-4o msgs per 3-hour rolling window (not a strict
//                    daily cap). Modelled as daily ≈ 80k at ~500 tok/msg avg.
//   ChatGPT Pro    – $200/mo; essentially unlimited. Conservative 250k cap.
//   Claude Pro     – Anthropic advertises "~5× more than free".
//                    Free ≈ 10k/day → Pro ≈ 100k/day (exact not published).
//   Gemini Adv.    – Google One AI Premium ($20/mo); Flash free is generous.
//   Grok X Prem.   – X Premium / Premium+ removes most hard message caps.

export const PLAN_PRESETS: Record<SiteId, Partial<Record<SitePlan, number>>> = {
  chatgpt: {
    free:    10_000,  // ~10–20 GPT-4o msgs/day on free; rest fall back to mini
    plus:    80_000,  // 160 msgs/3h rolling; modelled as daily budget
    pro:    250_000,  // OpenAI Pro ($200/mo) – capped conservatively
    custom:  80_000,
  },
  claude: {
    free:    10_000,  // ~5 Claude Sonnet messages/day on free
    pro:    100_000,  // Claude Pro – Anthropic "~5× free" (March 2026)
    custom:  60_000,
  },
  gemini: {
    free:      60_000,  // Gemini 1.5/2.0 Flash free tier
    advanced: 150_000,  // Gemini Advanced / Google One AI Premium ($20/mo)
    custom:    60_000,
  },
  grok: {
    free:     20_000,  // X.com free – limited Grok 3 messages
    xpremium: 80_000,  // X Premium / Premium+ – broader Grok 3 access
    custom:   40_000,
  },
};

// ─── Site Configs ─────────────────────────────────────────────────────────────
// Each inputSelectors / submitSelectors array is ordered: first match wins.
// Keeping multiple selectors guards against site UI updates breaking tracking.

export const SITE_CONFIGS: Record<SiteId, SiteConfig> = {
  // ── ChatGPT ────────────────────────────────────────────────────────────────
  // 2025+: #prompt-textarea is now a <div contenteditable> (not a textarea).
  // The id remained the same but the element type changed. We probe both to
  // handle any user still on the legacy UI or a future revert.
  // Submit: data-testid="send-button" is the most stable identifier.
  chatgpt: {
    label: "ChatGPT",
    inputSelectors: [
      "#prompt-textarea[contenteditable]",       // 2025+ contenteditable div
      "#prompt-textarea",                        // legacy textarea (same id)
      "div[contenteditable='true'][data-id]",   // backup contenteditable
      "textarea[data-id='root']",                // older GPT-4 UI
      "textarea[placeholder]",                   // last resort
    ],
    submitSelectors: [
      "[data-testid='send-button']",             // most reliable
      "button[aria-label='Send prompt']",
      "button[aria-label='Send message']",
      "form button[type='button']:last-of-type", // generic fallback
    ],
    messageSelector: "[data-message-author-role='user']",
    // contenteditable in 2025 UI; adapter probes .value vs innerText at runtime
    inputType:   "contenteditable",
    enterSubmits: true,
    accentClass: "bg-green-500",
  },

  // ── Claude ─────────────────────────────────────────────────────────────────
  // ProseMirror contenteditable div. The aria-label on the send button is
  // reliable; data-testid is an alternative seen in some versions.
  claude: {
    label: "Claude",
    inputSelectors: [
      "div[contenteditable='true'].ProseMirror",     // primary
      "[data-testid='chat-input'] div[contenteditable='true']",
      "div[contenteditable='true'][aria-label]",     // labelled fallback
      "div[contenteditable='true']",                 // last resort
    ],
    submitSelectors: [
      "button[aria-label='Send Message']",
      "[data-testid='send-button']",
      "button[type='submit']",
    ],
    messageSelector: "[data-testid='human-turn-content']",
    inputType:   "contenteditable",
    enterSubmits: true,
    accentClass: "bg-orange-500",
  },

  // ── Gemini ─────────────────────────────────────────────────────────────────
  // Uses a Quill-based rich-textarea (.ql-editor) or a plain div[role=textbox].
  // Gemini does NOT submit on bare Enter (Enter adds a newline) – only the
  // button click or Ctrl+Enter triggers send.
  gemini: {
    label: "Gemini",
    inputSelectors: [
      "div.ql-editor[contenteditable='true']",       // Quill editor (primary)
      "rich-textarea div[contenteditable='true']",   // web component wrapper
      "div[role='textbox'][contenteditable='true']", // generic ARIA textbox
      "textarea.input-area",                         // older Gemini UI
    ],
    submitSelectors: [
      "button[aria-label='Send message']",
      "button[aria-label='Submit']",
      "button.send-button",
      "mat-icon-button[aria-label='Send message']",  // Material button wrapper
    ],
    messageSelector: ".user-query-container .user-query-text, .user-message",
    inputType:   "contenteditable",
    enterSubmits: false, // Gemini uses Enter for newline; only button submits
    accentClass: "bg-blue-500",
  },

  // ── Grok ──────────────────────────────────────────────────────────────────
  // Lives on both x.com/i/grok and grok.x.ai.
  // 2025 Grok 3 UI uses a textarea; grok.x.ai standalone uses a larger
  // contenteditable. Both data-testid variants are included for coverage.
  grok: {
    label: "Grok",
    inputSelectors: [
      "textarea[data-testid='grok-prompt-input']",   // x.com/i/grok (most stable)
      "textarea[data-testid='prompt-input']",         // grok.x.ai alternate testid
      "textarea[aria-label='Ask anything']",
      "div[contenteditable='true'][data-testid]",    // contenteditable variant
      "textarea[placeholder]",                       // placeholder-based fallback
      "div[contenteditable='true'][aria-label]",
      "div[contenteditable='true']",
    ],
    submitSelectors: [
      "button[data-testid='send-button']",           // grok.x.ai
      "button[aria-label='Send message']",           // 2025 updated aria-label
      "button[aria-label='Send']",
      "button[type='submit']",
    ],
    messageSelector: "[data-testid='userMessage'], [class*='UserMessage'], [data-testid='user-message']",
    inputType:   "textarea",
    enterSubmits: true,
    accentClass: "bg-purple-500",
  },
};

// ─── UI ───────────────────────────────────────────────────────────────────────

export const WARNING_COLOUR_MAP = {
  safe:    "text-toki-500",
  warning: "text-warning",
  danger:  "text-danger",
} as const;
