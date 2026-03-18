// EXTENSION FILE: src/adapters/types.ts
// Interface every site adapter must implement.

export interface SiteAdapter {
  /**
   * Walk the selector priority chain until a matching element is found.
   * Returns null if the input hasn't rendered yet (e.g. during hydration).
   */
  getInputEl(): HTMLElement | null;

  /**
   * Walk the selector priority chain for the submit button.
   * Returns null if not found.
   */
  getSubmitEl(): HTMLElement | null;

  /**
   * Extract clean plain-text from the input element.
   * Handles both <textarea>.value and contenteditable.innerText correctly.
   */
  extractText(el: HTMLElement): string;

  /**
   * Return true if this keyboard event should trigger a prompt capture.
   * Sites differ: some submit on bare Enter, others require Ctrl+Enter or
   * only use the button.
   */
  isSubmitKeyEvent(e: KeyboardEvent): boolean;

  /**
   * Return true if this click event target is (or is inside) the submit button.
   * Adapters can also inspect the full event for e.g. disabled state checks.
   */
  isSubmitClickEvent(e: MouseEvent): boolean;
}
