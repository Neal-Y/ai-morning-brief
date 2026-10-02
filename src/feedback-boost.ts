import type { ClassifiedArticle } from './ai/provider.js';
import type { FeedbackRow } from './db/client.js';
import { displayTag } from './ai/categories.js';

/** Points added (👍) or removed (👎) per vote in the article's category. */
export const FEEDBACK_BOOST_PER_VOTE = 0.5;

/**
 * Adjust classification scores based on per-user feedback history.
 *
 * Votes carry the stored display tag (`#infra`), the classifier the raw
 * category (`infra-inference`); both go through displayTag() so they meet.
 * Until 2026-10-02 they were compared as-is, never matched, and this boost
 * never changed a score.
 */
export function applyFeedbackBoost(
  classified: ClassifiedArticle[],
  feedbackRows: FeedbackRow[],
): ClassifiedArticle[] {
  if (feedbackRows.length === 0) return classified;
  const net = new Map<string, number>();
  for (const f of feedbackRows) {
    const vote = f.signal === 'up' ? 1 : f.signal === 'down' ? -1 : 0;
    if (vote === 0) continue;
    const tag = displayTag(f.categoryTag);
    net.set(tag, (net.get(tag) ?? 0) + vote);
  }
  return classified.map((a) => {
    const boost = (net.get(displayTag(a.classification.category)) ?? 0) * FEEDBACK_BOOST_PER_VOTE;
    if (boost === 0) return a;
    return { ...a, classification: { ...a.classification, score: a.classification.score + boost } };
  });
}
