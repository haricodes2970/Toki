// EXTENSION FILE: src/dashboard/Dashboard.tsx
// Placeholder – will be built in Phase 4 (usage dashboard with charts)

import React from "react";
import { createRoot } from "react-dom/client";

function Dashboard() {
  return (
    <div className="flex items-center justify-center h-screen bg-zinc-950 text-white">
      <p className="text-sm text-zinc-400">Toki dashboard – coming soon.</p>
    </div>
  );
}

const root = document.getElementById("dashboard-root");
if (root) {
  createRoot(root).render(<Dashboard />);
}
