// EXTENSION FILE: src/shared/constants.ts

import type { DailyLimits, SiteConfig, SiteId } from "./types";

// ─── Storage Keys ─────────────────────────────────────────────────────────────

export const STORAGE_KEYS = {
  USAGE:    "toki_usage",
  HISTORY:  "toki_history",
  SETTINGS: "toki_settings",
} as const;

// ─── Alarms ───────────────────────────────────────────────────────────────────

export const DAILY_RESET_ALARM = "toki_daily_reset";

// ─── Overlay DOM ID ───────────────────────────────────────────────────────────
// Used to exclude Toki's own shadow host from MutationObserver callbacks.

export const OVERLAY_HOST_ID = "toki-overlay-root";

// ─── Default Limits (tokens / day per site) ───────────────────────────────────

export const DEFAULT_LIMITS: DailyLimits = {
  chatgpt: 80_000,
  gemini:  60_000,
  claude:  60_000,
  grok:    40_000,
};

// ─── Site Configs ─────────────────────────────────────────────────────────────
// Each inputSelectors / submitSelectors array is ordered: first match wins.
// Keeping multiple selectors guards against site UI updates breaking tracking.

export const SITE_CONFIGS: Record<SiteId, SiteConfig> = {
  // ── ChatGPT ────────────────────────────────────────────────────────────────
  // Input is a plain <textarea id="prompt-textarea">.
  // Submit button carries data-testid="send-button" (stable); aria-label is
  // a secondary fallback in case the testid is ever removed.
  chatgpt: {
    label: "ChatGPT",
    inputSelectors: [
      "#prompt-textarea",                        // primary – stable testid
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
    inputType:   "textarea",
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
  // The main input is a <textarea>; contenteditable is a secondary fallback
  // used in some embedded views.
  grok: {
    label: "Grok",
    inputSelectors: [
      "textarea[data-testid='grok-prompt-input']",   // testid (most stable)
      "textarea[aria-label='Ask anything']",
      "textarea[placeholder]",                       // placeholder-based fallback
      "div[contenteditable='true'][aria-label]",
      "div[contenteditable='true']",
    ],
    submitSelectors: [
      "button[aria-label='Send']",
      "button[data-testid='send-button']",
      "button[type='submit']",
    ],
    messageSelector: "[data-testid='userMessage'], [class*='UserMessage']",
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
