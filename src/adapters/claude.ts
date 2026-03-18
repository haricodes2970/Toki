// EXTENSION FILE: src/adapters/claude.ts
// Claude-specific adapter (claude.ai)
//
// Input:  ProseMirror contenteditable <div class="ProseMirror">
//         ProseMirror uses <p> tags internally – innerText handles this
//         correctly and preserves paragraph breaks as newlines.
//
// Submit: button[aria-label="Send Message"] is reliable.
//         Claude also shows a "Stop" button while generating – we guard
//         against capturing that as a submit event.
//
// Submit key: Enter submits. Shift+Enter inserts newline.

import { BaseAdapter } from "./base";
import { SITE_CONFIGS } from "@/shared/constants";

export class ClaudeAdapter extends BaseAdapter {
  constructor() {
    super(SITE_CONFIGS.claude);
  }

  extractText(el: HTMLElement): string {
    // ProseMirror: innerText gives us paragraph-separated text
    // Strip the trailing newline ProseMirror always appends
    return (el.innerText ?? "").replace(/\n$/, "").trim();
  }

  isSubmitClickEvent(e: MouseEvent): boolean {
    const target = e.target as Element | null;
    if (!target) return false;

    // Make sure the button isn't the "Stop generating" button
    // (Claude uses the same position for Stop during generation)
    const btn = target.closest("button");
    if (!btn) return false;

    const label = btn.getAttribute("aria-label") ?? "";
    if (label.toLowerCase().includes("stop")) return false;

    return this.config.submitSelectors.some((sel) => {
      try { return !!target.closest(sel); }
      catch { return false; }
    });
  }
}
