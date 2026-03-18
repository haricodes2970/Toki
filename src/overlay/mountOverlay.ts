// EXTENSION FILE: src/overlay/mountOverlay.ts
// ─────────────────────────────────────────────────────────────────────────────
// Mounts the React <Overlay /> component inside a closed Shadow DOM root.
// This function is called from content.ts after the page has loaded.
//
// Shadow DOM isolation means:
//  - Toki's CSS cannot affect the host page
//  - The host page's CSS cannot affect Toki
//  - No class name collisions
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { createRoot } from "react-dom/client";
import Overlay from "./Overlay";
import type { SiteId } from "@/shared/types";

const OVERLAY_HOST_ID = "toki-overlay-root";

/**
 * Mount the Toki overlay onto the current page.
 * Safe to call multiple times – subsequent calls are no-ops.
 */
export function mountOverlay(siteId: SiteId): void {
  // Guard: already mounted?
  if (document.getElementById(OVERLAY_HOST_ID)?.shadowRoot) return;

  // 1. Create the host element (already exists from content.ts skeleton, but ensure it's there)
  let host = document.getElementById(OVERLAY_HOST_ID);
  if (!host) {
    host = document.createElement("div");
    host.id = OVERLAY_HOST_ID;
    document.documentElement.appendChild(host);
  }

  // 2. Position the host container
  Object.assign(host.style, {
    position:      "fixed",
    zIndex:        "2147483647",
    top:           "0",
    left:          "0",
    width:         "0",
    height:        "0",
    overflow:      "visible",
    pointerEvents: "none",
    // No dimensions so it doesn't intercept any clicks on the host page.
    // The overlay panel itself sets pointerEvents: "auto" for its own area.
  });

  // 3. Attach Shadow DOM (closed → invisible to host page JS)
  const shadow = host.attachShadow({ mode: "closed" });

  // 4. Inject base reset styles into the shadow root
  const style = document.createElement("style");
  style.textContent = SHADOW_RESET_CSS;
  shadow.appendChild(style);

  // 5. Create React mount point inside the shadow
  const mountPoint = document.createElement("div");
  mountPoint.id = "toki-react-root";
  shadow.appendChild(mountPoint);

  // 6. Render
  const root = createRoot(mountPoint);
  root.render(React.createElement(Overlay, { siteId }));

  console.log("[Toki] Overlay mounted inside Shadow DOM.");
}

// ─── Shadow DOM Reset CSS ────────────────────────────────────────────────────
// Minimal reset so the overlay renders consistently regardless of host page.

const SHADOW_RESET_CSS = `
  :host {
    all: initial;
    font-family: 'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont,
                 'Segoe UI', Roboto, sans-serif;
    color-scheme: dark;
  }

  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* Smooth font rendering */
  #toki-react-root {
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  /* Hover effects for icon buttons */
  button:hover {
    filter: brightness(1.2);
  }

  /* Input focus ring */
  input:focus {
    border-color: rgba(34,197,94,0.6) !important;
    box-shadow: 0 0 0 2px rgba(34,197,94,0.2);
  }
`;
