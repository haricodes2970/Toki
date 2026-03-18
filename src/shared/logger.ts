// EXTENSION FILE: src/shared/logger.ts
// ─────────────────────────────────────────────────────────────────────────────
// Production-safe logger.
// In development builds: logs to console with [Toki] prefix.
// In production builds:  all logging is stripped to zero overhead.
//
// Usage:
//   import { log, warn, error } from "@/shared/logger";
//   log("overlay mounted");          // → console.log in dev only
//   warn("selector miss", selector); // → console.warn in dev only
//   error("storage failed", err);    // → console.error in dev AND prod
// ─────────────────────────────────────────────────────────────────────────────

const IS_DEV = import.meta.env.MODE !== "production";
const PREFIX = "[Toki]";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = any[];

export function log(...args: AnyArgs): void {
  if (IS_DEV) console.log(PREFIX, ...args);
}

export function warn(...args: AnyArgs): void {
  if (IS_DEV) console.warn(PREFIX, ...args);
}

// Errors always log – they indicate real problems the developer needs to know.
export function error(...args: AnyArgs): void {
  console.error(PREFIX, ...args);
}

export function group(label: string, fn: () => void): void {
  if (!IS_DEV) { fn(); return; }
  console.groupCollapsed(`${PREFIX} ${label}`);
  fn();
  console.groupEnd();
}
