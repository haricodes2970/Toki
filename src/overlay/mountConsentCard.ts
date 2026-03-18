// EXTENSION FILE: src/overlay/mountConsentCard.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mounts / unmounts the first-visit ConsentCard inside a closed shadow DOM.
// Uses a dedicated host element (#toki-consent-root) separate from the overlay
// so the two components never interfere with each other's lifecycle.
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { createRoot } from "react-dom/client";
import { ConsentCard } from "./ConsentCard";

const CONSENT_HOST_ID = "toki-consent-root";

export function mountConsentCard(siteName: string): void {
  if (document.getElementById(CONSENT_HOST_ID)) return; // already mounted

  const host = document.createElement("div");
  host.id = CONSENT_HOST_ID;
  // Zero-size host; card is positioned fixed inside the shadow
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:2147483647;";
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  // Minimal CSS reset so the card renders consistently regardless of host page styles
  const style = document.createElement("style");
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :host { all: initial; }
    button { font-family: inherit; }
  `;
  shadow.appendChild(style);

  const container = document.createElement("div");
  container.style.pointerEvents = "auto";
  shadow.appendChild(container);

  createRoot(container).render(
    React.createElement(ConsentCard, { siteName }),
  );
}

export function unmountConsentCard(): void {
  document.getElementById(CONSENT_HOST_ID)?.remove();
}
