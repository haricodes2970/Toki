// EXTENSION FILE: src/adapters/base.ts
// Base class implementing shared selector-chain logic.
// Each site adapter extends this and overrides only what differs.

import type { SiteAdapter } from "./types";
import type { SiteConfig } from "@/shared/types";

export abstract class BaseAdapter implements SiteAdapter {
  protected readonly config: SiteConfig;

  constructor(config: SiteConfig) {
    this.config = config;
  }

  // ── Selector chain helpers ──────────────────────────────────────────────

  /**
   * Tries each selector in order, returns the first matching HTMLElement.
   * This means if ChatGPT ever removes `#prompt-textarea`, we fall through
   * to the next selector automatically.
   */
  protected queryFirst(selectors: string[]): HTMLElement | null {
    for (const sel of selectors) {
      try {
        const el = document.querySelector<HTMLElement>(sel);
        if (el) return el;
      } catch {
        // Malformed selector in a fallback – skip it silently
      }
    }
    return null;
  }

  getInputEl(): HTMLElement | null {
    return this.queryFirst(this.config.inputSelectors);
  }

  getSubmitEl(): HTMLElement | null {
    return this.queryFirst(this.config.submitSelectors);
  }

  // ── Text extraction ─────────────────────────────────────────────────────

  extractText(el: HTMLElement): string {
    if (el instanceof HTMLTextAreaElement) {
      return el.value.trim();
    }
    // contenteditable: innerText respects rendered line breaks;
    // textContent collapses them. innerText is what the user sees.
    return (el.innerText ?? el.textContent ?? "").trim();
  }

  // ── Event checks ────────────────────────────────────────────────────────

  isSubmitKeyEvent(e: KeyboardEvent): boolean {
    if (!this.config.enterSubmits) return false;
    return e.key === "Enter" && !e.shiftKey && !e.altKey;
  }

  isSubmitClickEvent(e: MouseEvent): boolean {
    const target = e.target as Element | null;
    if (!target) return false;
    return this.config.submitSelectors.some((sel) => {
      try { return !!target.closest(sel); }
      catch { return false; }
    });
  }
}
