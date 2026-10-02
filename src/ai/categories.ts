import type { Category } from './provider.js';

// One canonical mapping from classifier category to the tag stored in
// `articles.category_tag` and shown in the app (2026-10-02).
//
// Before this, three places disagreed: the brief generator asked the LLM to
// map `infra-inference` → `#infra`, the degraded fallback stored
// `#infra-inference`, and the feedback boost compared the classifier's
// `infra-inference` with stored `#infra` — so a 👍 never matched anything and
// the per-device boost silently did nothing.

export const CATEGORY_DISPLAY_TAG: Readonly<Record<Category, string>> = {
  'model-release': '#model-release',
  'api-platform': '#api-platform',
  'infra-inference': '#infra',
  'tooling-open-source': '#tooling',
  'benchmark-eval': '#eval',
  'agent-systems': '#agent',
  'policy-regulation': '#policy',
  'company-market': '#market',
  'social-opinion': '#opinion',
  'event-promo': '#market',
  'research-adjacent': '#research',
};

const KNOWN_TAGS = new Set(Object.values(CATEGORY_DISPLAY_TAG));

/**
 * The display tag for a classifier category or any stored tag, including the
 * legacy `#infra-inference` form written by the degraded fallback. Unknown
 * values pass through so nothing is silently relabelled.
 */
export function displayTag(categoryOrTag: string): string {
  const bare = categoryOrTag.trim().replace(/^#/, '').toLowerCase();
  const mapped = (CATEGORY_DISPLAY_TAG as Record<string, string>)[bare];
  if (mapped) return mapped;
  const tag = `#${bare}`;
  return KNOWN_TAGS.has(tag) ? tag : categoryOrTag;
}
