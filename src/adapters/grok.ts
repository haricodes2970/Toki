// EXTENSION FILE: src/adapters/grok.ts
// Grok-specific adapter (grok.x.ai + x.com/i/grok)
//
// Input:  <textarea> on grok.x.ai main page (most stable)
//         Falls back to contenteditable for embedded views on x.com.
//
// Submit: button[aria-label="Send"] is the primary anchor.
//         Grok also disables the button while generating – we check for
//         the disabled attribute to avoid double-counting stop events.
//
// Submit key: Enter submits. Shift+Enter inserts newline.
//             Ctrl+Enter also submits (power users).

import { BaseAdapter } from "./base";
import { SITE_CONFIGS } from "@/shared/constants";

export class GrokAdapter extends BaseAdapter {
  constructor() {
    super(SITE_CONFIGS.grok);
  }

  extractText(el: HTMLElement): string {
    if (el instanceof HTMLTextAreaElement) {
      return el.value.trim();
    }
    return (el.innerText ?? "").trim();
  }

  isSubmitKeyEvent(e: KeyboardEvent): boolean {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return true;
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) return true;
    return false;
  }

  isSubmitClickEvent(e: MouseEvent): boolean {
    const target = e.target as Element | null;
    if (!target) return false;

    const btn = target.closest("button");
    // Guard: don't capture click on a disabled button (Grok disables during gen)
    if (btn?.disabled) return false;

    return this.config.submitSelectors.some((sel) => {
      try { return !!target.closest(sel); }
      catch { return false; }
    });
  }
}
