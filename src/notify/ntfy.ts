import type { BriefResult } from '../ai/provider.js';
import { NTFY_BASE_URL } from '../config.js';

const NTFY_TIMEOUT_MS = 10_000;
const MAX_ACTIONS = 3;

const SECTION_ICONS: Record<string, string> = {
  'Hard Tech AI': '🔧',
  'Important AI Signals': '📡',
};

const RECOMMENDATION_ICON: Record<string, string> = {
  READ_NOW: '✅ READ NOW',
  SKIM: '📖 SKIM',
  SKIP: '⏭️ SKIP',
};

const NUM_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

export function formatBriefText(brief: BriefResult, providerName: string): string {
  // Note: brief.title is sent as the ntfy notification Title header — do NOT repeat it in the body.
  const parts: string[] = [];

  for (const section of brief.sections) {
    const icon = SECTION_ICONS[section.name] ?? '📋';
    const visibleItems = section.items.filter((item) => item.renderLevel !== 'OMIT');
    if (visibleItems.length === 0) continue;

    parts.push(`─────────────────\n${icon} ${section.name}\n─────────────────`);

    for (const item of visibleItems) {
      const numIcon = NUM_EMOJIS[item.index - 1] ?? `${item.index}.`;

      if (item.renderLevel === 'LIGHT') {
        // Compact two-line format: title, then tag + judgment
        const judgment = item.shortJudgment ?? '工程直接價值低';
        parts.push(
          [
            `${numIcon} ${item.title}`,
            `${item.categoryTag}  ${judgment}`,
          ].join('\n')
        );
      } else {
        // FULL format: title, summary, impact, recommendation+reason, tag
        const recIcon = RECOMMENDATION_ICON[item.recommendation] ?? item.recommendation;
        parts.push(
          [
            `${numIcon} ${item.title}`,
            `📌 ${item.summary}`,
            `🔍 ${item.engineeringImpact}`,
            `${recIcon} — ${item.reason}`,
            `${item.categoryTag}`,
          ].join('\n')
        );
      }
    }
  }

  if (brief.skippedToday.length > 0) {
    parts.push('─────────────────\n⏭️ 今日略過');
    parts.push(brief.skippedToday.map((s) => `• ${s}`).join('\n'));
  }

  parts.push(`─────────────────\n🛠️ Provider: ${providerName}`);
  return parts.join('\n\n');
}

function sanitizeUrl(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return undefined;
    const safe = parsed.toString();
    if (/[\r\n]/.test(safe)) return undefined;
    return safe;
  } catch {
    return undefined;
  }
}

function buildActionsHeader(links: Array<{ label: string; url: string }>): string | undefined {
  const actions = links
    .slice(0, MAX_ACTIONS)
    .map(({ label, url }) => {
      const safe = sanitizeUrl(url);
      // Ensure label is ASCII-safe (strip non-ASCII for HTTP header)
      const safeLabel = label.replace(/[^\x20-\x7E]/g, '').trim() || 'Article';
      return safe ? `view, ${safeLabel}, ${safe}` : null;
    })
    .filter((a): a is string => a !== null);
  return actions.length > 0 ? actions.join('; ') : undefined;
}

export async function sendNtfy(
  topic: string,
  title: string,
  body: string,
  options: {
    clickUrl?: string;
    actionLinks?: Array<{ label: string; url: string }>;
  } = {}
): Promise<void> {
  const url = `${NTFY_BASE_URL}/${topic}`;
  const headers: Record<string, string> = {
    'Title': title,
    'Tags': 'newspaper,robot',
    'Content-Type': 'text/plain; charset=utf-8',
  };

  if (options.clickUrl) {
    const safeUrl = sanitizeUrl(options.clickUrl);
    if (safeUrl) headers['Click'] = safeUrl;
  }

  if (options.actionLinks && options.actionLinks.length > 0) {
    const actionsHeader = buildActionsHeader(options.actionLinks);
    if (actionsHeader) headers['Actions'] = actionsHeader;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(NTFY_TIMEOUT_MS),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ntfy POST failed: ${response.status} ${response.statusText} — ${text}`);
  }
}

export async function sendErrorNotice(topic: string, message: string): Promise<void> {
  await sendNtfy(topic, 'AI Morning Brief - Error', `⚠️ AI 晨報發生錯誤\n\n${message}`);
}

export async function sendEmptyNotice(topic: string, date: string): Promise<void> {
  await sendNtfy(topic, 'AI Morning Brief', `📰 AI 晨報 ${date}\n\n今日無重大 AI 新聞。`);
}
