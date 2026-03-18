// EXTENSION FILE: src/adapters/chatgpt.ts
// ChatGPT-specific adapter (chatgpt.com)
//
// Input:  <textarea id="prompt-textarea">
//         Standard textarea so .value is used directly.
//
// Submit: [data-testid="send-button"] – this testid has been stable
//         since GPT-4 launched. The aria-label fallback is for older UI.
//
// Submit key: bare Enter submits. Shift+Enter inserts newline.

import { BaseAdapter } from "./base";
import { SITE_CONFIGS } from "@/shared/constants";

export class ChatGPTAdapter extends BaseAdapter {
  constructor() {
    super(SITE_CONFIGS.chatgpt);
  }

  // Override: textarea uses .value, not innerText
  extractText(el: HTMLElement): string {
    if (el instanceof HTMLTextAreaElement) {
      return el.value.trim();
    }
    return (el.innerText ?? "").trim();
  }

  // ChatGPT also sends on Ctrl+Enter (when enter-to-send is disabled by user)
  isSubmitKeyEvent(e: KeyboardEvent): boolean {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) return true;  // always works
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) return true;  // default mode
    return false;
  }
}
