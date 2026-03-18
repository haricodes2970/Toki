// EXTENSION FILE: src/shared/constants.ts
// App-wide constants – never put secrets here (MV3 bundles are readable).

import type { DailyLimits, SiteConfig, SiteId } from "./types";

// ─── Storage Keys ─────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  USAGE:    "toki_usage",
  HISTORY:  "toki_history",
  SETTINGS: "toki_settings",
} as const;

// ─── Alarms ───────────────────────────────────────────────────────────────────

export const DAILY_RESET_ALARM = "toki_daily_reset";

// ─── Default Limits (tokens / day per site) ───────────────────────────────────
// These are conservative starting points; users can override in settings.
// ChatGPT Plus = ~40 msgs / 3 hrs on GPT-4o (~2k tokens avg → ~80k/day equiv.)
// Claude.ai Pro = ~45 msgs / 5 hrs on Sonnet (~1.5k avg → ~67k/day equiv.)

export const DEFAULT_LIMITS: DailyLimits = {
  chatgpt: 80_000,
  gemini:  60_000,
  claude:  60_000,
  grok:    40_000,
};

// ─── Site Configs ─────────────────────────────────────────────────────────────
// Selectors are best-effort approximations; Module 2 will harden these with
// site-specific adapter files that can be updated independently.

export const SITE_CONFIGS: Record<SiteId, SiteConfig> = {
  chatgpt: {
    label:           "ChatGPT",
    submitSelector:  "[data-testid='send-button'], button[aria-label='Send prompt']",
    messageSelector: "[data-message-author-role='user']",
    inputSelector:   "#prompt-textarea",
    accentClass:     "bg-green-500",
  },
  gemini: {
    label:           "Gemini",
    submitSelector:  "button.send-button, [aria-label='Send message']",
    messageSelector: ".user-query-container, .user-message",
    inputSelector:   ".ql-editor[contenteditable='true'], textarea.input-area",
    accentClass:     "bg-blue-500",
  },
  claude: {
    label:           "Claude",
    submitSelector:  "button[aria-label='Send Message'], button[type='submit']",
    messageSelector: "[data-testid='human-turn-content']",
    inputSelector:   "div[contenteditable='true'].ProseMirror",
    accentClass:     "bg-orange-500",
  },
  grok: {
    label:           "Grok",
    submitSelector:  "button[type='submit'], button[aria-label='Send']",
    messageSelector: "[class*='userMessage'], [data-testid='userMessage']",
    inputSelector:   "textarea[placeholder], div[contenteditable='true']",
    accentClass:     "bg-purple-500",
  },
};

// ─── UI ───────────────────────────────────────────────────────────────────────

export const WARNING_COLOUR_MAP = {
  safe:    "text-toki-500",
  warning: "text-warning",
  danger:  "text-danger",
} as const;
