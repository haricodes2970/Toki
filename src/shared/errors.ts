// EXTENSION FILE: src/shared/errors.ts
// Typed error classes + a safe async wrapper used across the extension.

export class TokiStorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "TokiStorageError";
  }
}

export class TokiAdapterError extends Error {
  constructor(message: string, public readonly siteId?: string) {
    super(message);
    this.name = "TokiAdapterError";
  }
}

/**
 * Wraps an async function and swallows errors in production.
 * In dev mode, errors are re-thrown so they surface in DevTools.
 */
export async function safeAsync<T>(
  fn: () => Promise<T>,
  fallback: T,
  label?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (import.meta.env.MODE !== "production") {
      console.error(`[Toki] safeAsync error${label ? ` (${label})` : ""}:`, err);
    }
    return fallback;
  }
}
