// EXTENSION FILE: src/shared/types.ts
// Central type definitions shared across background, content, popup, and dashboard.

// ─── Site ─────────────────────────────────────────────────────────────────────

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

// ─── Messages (background ↔ content ↔ popup) ─────────────────────────────────

export type TokiMessage =
  | { type: "RECORD_USAGE";  payload: UsageRecord }
  | { type: "GET_USAGE";     payload: { siteId?: SiteId } }
  | { type: "GET_SETTINGS";  payload?: never }
  | { type: "SET_SETTINGS";  payload: Partial<TokiSettings> }
  | { type: "RESET_USAGE";   payload?: never }
  | { type: "USAGE_UPDATED"; payload: UsageRecord };

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
