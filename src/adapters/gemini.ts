// EXTENSION FILE: src/adapters/gemini.ts
// Gemini-specific adapter (gemini.google.com)
//
// Input:  Quill editor: div.ql-editor[contenteditable="true"]
//         or a <rich-textarea> web component wrapping a contenteditable div.
//
// Submit: button[aria-label="Send message"] is the reliable anchor.
//         Gemini uses Material Design so the button may be wrapped in
//         a mat-icon-button component – closest() handles that.
//
// Submit key: Gemini does NOT submit on bare Enter.
//             Enter always inserts a newline.
//             Only the send button triggers submission.
//             (enterSubmits: false in config – BaseAdapter handles this)

import { BaseAdapter } from "./base";
import { SITE_CONFIGS } from "@/shared/constants";

export class GeminiAdapter extends BaseAdapter {
  constructor() {
    super(SITE_CONFIGS.gemini);
  }

  getInputEl(): HTMLElement | null {
    // Try the standard chain first
    const el = super.getInputEl();
    if (el) return el;

    // Gemini sometimes renders inside a <rich-textarea> web component.
    // Shadow DOM from web components is accessible via direct querySelector
    // since it's an open shadow (not closed like ours).
    const richTextarea = document.querySelector("rich-textarea");
    if (richTextarea?.shadowRoot) {
      const inner = richTextarea.shadowRoot.querySelector<HTMLElement>(
        "div[contenteditable='true']",
      );
      if (inner) return inner;
    }

    return null;
  }

  extractText(el: HTMLElement): string {
    // Quill adds a trailing <br> in an empty paragraph – strip it
    const text = (el.innerText ?? el.textContent ?? "").trim();
    return text === "\n" ? "" : text;
  }
}
