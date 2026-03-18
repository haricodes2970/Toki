// EXTENSION FILE: src/adapters/index.ts
// Registry – maps SiteId → adapter instance.

import type { SiteAdapter } from "./types";
import { ChatGPTAdapter } from "./chatgpt";
import { ClaudeAdapter }  from "./claude";
import { GeminiAdapter }  from "./gemini";
import { GrokAdapter }    from "./grok";
import type { SiteId }    from "@/shared/types";

export type { SiteAdapter };

export function getAdapter(siteId: SiteId): SiteAdapter {
  switch (siteId) {
    case "chatgpt": return new ChatGPTAdapter();
    case "claude":  return new ClaudeAdapter();
    case "gemini":  return new GeminiAdapter();
    case "grok":    return new GrokAdapter();
  }
}
