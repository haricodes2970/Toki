// EXTENSION FILE: src/shared/types.ts
// Central type definitions shared across background, content, popup, and dashboard.

// ─── Site ─────────────────────────────────────────────────────────────────────

export type ResetType = "daily" | "rolling";
export type SitePlan  = "free" | "plus" | "pro" | "advanced" | "xpremium" | "custom";

export type SiteId = "chatgpt" | "gemini" | "claude" | "grok";

export interface SiteConfig {
  /** Label shown in overlay and dashboard */
  label: string;
  /**
   * Ordered list of CSS selectors to try for the prompt input.
   * First match wins. Supports <textarea> and contenteditable elements.
   */
  inputSelectors: string[];
  /**
   * Ordered list of CSS selectors to try for the send/submit button.
   * First match wins.
   */
  submitSelectors: string[];
  /** CSS selector for rendered user message bubbles (MutationObserver fallback) */
  messageSelector: string;
  /** How to read text from the input element */
  inputType: "textarea" | "contenteditable";
  /**
   * Whether Enter (without Shift) submits on this site.
   * If false, only button click is tracked (e.g. Gemini allows multiline Enter).
   */
  enterSubmits: boolean;
  /** Tailwind colour class used as the site accent in the overlay */
  accentClass: string;
}

// ─── Usage ────────────────────────────────────────────────────────────────────

export interface UsageRecord {
  siteId:   SiteId;
  tokens:   number;
  prompts:  number;
  lastUsed: number; // Unix ms
  date?:    string; // "YYYY-MM-DD" – added by background on write
}

export interface DailyLimits {
  chatgpt: number;
  gemini:  number;
  claude:  number;
  grok:    number;
}

export interface TokiSettings {
  limits:           DailyLimits;
  warningThreshold: number;       // 0–1, e.g. 0.8 = warn at 80%
  overlayPosition:  OverlayPosition;
  overlayEnabled:   boolean;
}

export type OverlayPosition =
  | "bottom-right"
  | "bottom-left"
  | "top-right"
  | "top-left";

// ─── Per-site consent & plan state ───────────────────────────────────────────
// Stored under STORAGE_KEYS.SITE_STATE as { [hostname]: SiteState }.
// Lives in chrome.storage.local (device-specific; messageTimestamps are high-write).

export interface SiteState {
  /** Which plan the user selected – determines which PLAN_PRESET budget applies */
  plan:              SitePlan;
  /** Tokens manually entered by user ("Already used ___ tokens today") */
  offsetTokens:      number;
  /** null = not yet prompted; true = user allowed; false = user denied */
  consented:         boolean | null;
  /** Unix ms of last manual or automatic reset */
  lastReset:         number;
  /** Unix ms timestamp of each recorded send – used for rolling-window math */
  messageTimestamps: number[];
}

// ─── Messages (background ↔ content ↔ popup) ─────────────────────────────────

export type TokiMessage =
  | { type: "RECORD_USAGE";  payload: UsageRecord }
  | { type: "GET_USAGE";     payload: { siteId?: SiteId } }
  | { type: "GET_SETTINGS";  payload?: never }
  | { type: "SET_SETTINGS";  payload: Partial<TokiSettings> }
  | { type: "RESET_USAGE";    payload?: never }
  | { type: "USAGE_UPDATED";  payload: UsageRecord }
  | { type: "GET_SITE_STATE"; payload: { hostname: string } }
  | { type: "SET_SITE_STATE"; payload: { hostname: string; state: Partial<SiteState> } };

// ─── API Responses ────────────────────────────────────────────────────────────

export interface TokiOkResponse<T = void> {
  ok:    true;
  data?: T;
}

export interface TokiErrorResponse {
  ok:    false;
  error: string;
}

export type TokiResponse<T = void> = TokiOkResponse<T> | TokiErrorResponse;
