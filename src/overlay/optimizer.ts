// EXTENSION FILE: src/overlay/optimizer.ts
// ─────────────────────────────────────────────────────────────────────────────
// Rule-based prompt optimizer.
// No network calls, no ML – pure text analysis.
//
// Returns a list of OptimizationSuggestion objects.
// The UI (PreSendWarning.tsx) renders them as actionable tips.
// ─────────────────────────────────────────────────────────────────────────────

export interface OptimizationSuggestion {
  id:      string;
  label:   string;           // short name shown as a tag
  detail:  string;           // full explanation
  saving:  number;           // rough token saving estimate
  example?: string;          // optional before/after snippet
}

export interface OptimizerResult {
  suggestions:  OptimizationSuggestion[];
  totalSaving:  number;   // sum of saving estimates
  wordCount:    number;
  sentenceCount: number;
}

// ─── Main analyser ────────────────────────────────────────────────────────────

export function analyzePrompt(text: string): OptimizerResult {
  const suggestions: OptimizationSuggestion[] = [];

  const words     = text.trim().split(/\s+/);
  const wordCount = words.length;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const sentenceCount = sentences.length;

  // ── Rule 1: Filler phrases ──────────────────────────────────────────────
  const fillerMatches = findFillerPhrases(text);
  if (fillerMatches.length > 0) {
    suggestions.push({
      id:     "filler-phrases",
      label:  "Filler phrases",
      detail: `Found ${fillerMatches.length} filler phrase${fillerMatches.length > 1 ? "s" : ""} that add tokens without value: "${fillerMatches.slice(0, 3).join('", "')}"`,
      saving: fillerMatches.length * 8,
      example: `"Please could you kindly help me with…" → "Help me with…"`,
    });
  }

  // ── Rule 2: Excessive politeness ───────────────────────────────────────
  if (/\b(please|kindly|would you mind|could you possibly|i was wondering if)\b/i.test(text)) {
    suggestions.push({
      id:     "politeness",
      label:  "Over-politeness",
      detail: "LLMs don't need social courtesies – they add tokens without improving responses.",
      saving: 12,
      example: `"Could you please kindly explain…" → "Explain…"`,
    });
  }

  // ── Rule 3: Redundant preamble ─────────────────────────────────────────
  if (/^(hi|hello|hey|good (morning|afternoon|evening))[,!\s]/i.test(text.trim())) {
    suggestions.push({
      id:     "preamble",
      label:  "Greeting preamble",
      detail: "Opening greetings consume tokens. Start directly with your request.",
      saving: 10,
    });
  }

  // ── Rule 4: Very long prompt ───────────────────────────────────────────
  if (wordCount > 300) {
    suggestions.push({
      id:     "long-prompt",
      label:  "Long prompt",
      detail: `This prompt has ${wordCount} words (~${Math.ceil(wordCount * 1.3)} tokens). Consider breaking it into smaller, focused prompts.`,
      saving: Math.floor((wordCount - 200) * 1.3),
    });
  }

  // ── Rule 5: Repeated context ───────────────────────────────────────────
  const repeatedPhrases = findRepeatedPhrases(text);
  if (repeatedPhrases.length > 0) {
    suggestions.push({
      id:     "repetition",
      label:  "Repeated phrases",
      detail: `Found repeated phrases: "${repeatedPhrases[0]}". Removing duplicates saves tokens.`,
      saving: repeatedPhrases.length * 15,
    });
  }

  // ── Rule 6: Verbose instruction style ──────────────────────────────────
  const verboseCount = countVerboseInstructions(text);
  if (verboseCount >= 2) {
    suggestions.push({
      id:     "verbose-instructions",
      label:  "Verbose instructions",
      detail: `${verboseCount} verbose instruction phrases detected. Use terse bullet-style: "Do X" not "I would like you to please do X".`,
      saving: verboseCount * 10,
    });
  }

  // ── Rule 7: Embedded examples that could be shortened ──────────────────
  if (wordCount > 150 && (text.includes("for example") || text.includes("such as") || text.includes("e.g."))) {
    suggestions.push({
      id:     "long-examples",
      label:  "Long examples",
      detail: "Inline examples add many tokens. Reference them briefly or move to a follow-up.",
      saving: 30,
    });
  }

  const totalSaving = suggestions.reduce((acc, s) => acc + s.saving, 0);

  return { suggestions, totalSaving, wordCount, sentenceCount };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FILLER_PHRASES = [
  "as an ai language model",
  "i hope this message finds you well",
  "i am writing to",
  "i wanted to reach out",
  "just to let you know",
  "i was just wondering",
  "feel free to",
  "don't hesitate to",
  "in order to",
  "in the event that",
  "due to the fact that",
  "at this point in time",
  "it is important to note that",
  "it goes without saying",
  "needless to say",
  "as a matter of fact",
  "the thing is",
  "to be honest with you",
  "i would like to take this opportunity",
];

function findFillerPhrases(text: string): string[] {
  const lower = text.toLowerCase();
  return FILLER_PHRASES.filter((p) => lower.includes(p));
}

function findRepeatedPhrases(text: string): string[] {
  // Find 3+ word sequences that appear more than once
  const words = text.toLowerCase().split(/\s+/);
  const seen  = new Map<string, number>();
  const repeated: string[] = [];

  for (let i = 0; i < words.length - 2; i++) {
    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    seen.set(phrase, (seen.get(phrase) ?? 0) + 1);
  }

  for (const [phrase, count] of seen.entries()) {
    if (count > 1 && phrase.length > 8) repeated.push(phrase);
  }

  return repeated.slice(0, 3);
}

const VERBOSE_PATTERNS = [
  /i (would|'d) like (you )?to/i,
  /please (make sure|ensure|be sure)/i,
  /it is (important|necessary|essential|critical) (that|to)/i,
  /you (should|must|need to|have to)/i,
];

function countVerboseInstructions(text: string): number {
  return VERBOSE_PATTERNS.filter((p) => p.test(text)).length;
}
