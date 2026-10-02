import { extractJson } from './provider.js';

// Lenient JSON parsing for LLM output (2026-10-02).
//
// On 2026-10-02 the brief generator returned invalid JSON twice in a row and
// the day fell back to the degraded brief. The usual culprits are mechanical:
// an ASCII double quote copied into a string value (article titles such as
// `"Think of it as Kubernetes for agents"`), a raw newline inside a string, or
// a trailing comma. Those are repaired here before giving up; anything else
// still fails, and the error carries enough of the text to diagnose it.

export class LlmJsonError extends Error {
  constructor(message: string, readonly raw: string) {
    super(message);
    this.name = 'LlmJsonError';
  }
}

const STRUCTURAL_AFTER_COMMA = /["{[\]}\-\d tfn]/;

/** Next non-whitespace character index at or after `from`, or -1. */
function nextNonSpace(s: string, from: number): number {
  for (let i = from; i < s.length; i++) {
    if (!/\s/.test(s[i]!)) return i;
  }
  return -1;
}

/**
 * Whether a `"` at `i` (inside a string) really closes it: what follows must be
 * JSON structure, not more prose.
 */
function closesString(s: string, i: number): boolean {
  const j = nextNonSpace(s, i + 1);
  if (j === -1) return true;
  const n = s[j]!;
  if (n === '}' || n === ']' || n === ':') return true;
  if (n !== ',') return false;
  // A comma inside prose is followed by more prose; a structural comma is
  // followed by the next key, value or the end of the container.
  const k = nextNonSpace(s, j + 1);
  return k === -1 || STRUCTURAL_AFTER_COMMA.test(s[k]!);
}

/**
 * Escapes stray quotes and raw newlines inside string values and drops trailing
 * commas. Valid JSON passes through unchanged.
 */
export function repairJson(s: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (!inString) {
      if (c === ',') {
        const j = nextNonSpace(s, i + 1);
        if (j !== -1 && (s[j] === '}' || s[j] === ']')) continue; // trailing comma
      }
      if (c === '"') inString = true;
      out += c;
      continue;
    }
    if (escaped) {
      out += c;
      escaped = false;
      continue;
    }
    if (c === '\\') {
      out += c;
      escaped = true;
      continue;
    }
    if (c === '"') {
      if (closesString(s, i)) {
        inString = false;
        out += c;
      } else {
        out += '\\"';
      }
      continue;
    }
    if (c === '\n') { out += '\\n'; continue; }
    if (c === '\r') { out += '\\r'; continue; }
    if (c === '\t') { out += '\\t'; continue; }
    out += c;
  }
  return out;
}

function describeFailure(text: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const pos = Number(/position (\d+)/.exec(message)?.[1]);
  const around = Number.isFinite(pos)
    ? ` near …${text.slice(Math.max(0, pos - 80), pos + 80)}…`
    : '';
  return `${message}${around}`;
}

/**
 * Parses LLM output as JSON: code fences stripped, then strict parse, then one
 * repair attempt. `repaired` tells the caller to log that a repair happened.
 */
export function parseLlmJson(raw: string, label: string): { value: unknown; repaired: boolean } {
  const cleaned = extractJson(raw);
  try {
    return { value: JSON.parse(cleaned), repaired: false };
  } catch (strictErr) {
    try {
      return { value: JSON.parse(repairJson(cleaned)), repaired: true };
    } catch {
      throw new LlmJsonError(
        `${label} returned invalid JSON (${cleaned.length} chars): ${describeFailure(cleaned, strictErr)}`,
        cleaned,
      );
    }
  }
}
