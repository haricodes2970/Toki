// EXTENSION FILE: src/popup/Popup.tsx
// Placeholder – will be built in Phase 3 (popup dashboard)

import React from "react";
import { createRoot } from "react-dom/client";

function Popup() {
  return (
    <div className="flex items-center justify-center h-screen bg-zinc-950 text-white">
      <p className="text-sm text-zinc-400">Toki popup – coming soon.</p>
    </div>
  );
}

const root = document.getElementById("popup-root");
if (root) {
  createRoot(root).render(<Popup />);
}
