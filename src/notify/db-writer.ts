import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { articles } from '../db/schema.js';
import type { BriefResult, ClassifiedArticle } from '../ai/provider.js';

function urlToId(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export async function writeArticlesToDB(
  brief: BriefResult,
  selected: ClassifiedArticle[],
  date: string,
): Promise<void> {
  const metaMap = new Map(
    selected.map((a) => [a.link, { source: a.source, score: a.classification.score }]),
  );

  const rows = brief.sections
    .flatMap((s) => s.items)
    .map((item) => {
      const meta = metaMap.get(item.url);
      return {
        id: urlToId(item.url),
        url: item.url,
        title: item.title,
        summary: item.summary,
        context: item.context,
        engineeringImpact: item.engineeringImpact,
        reason: item.reason,
        shortJudgment: item.shortJudgment,
        categoryTag: item.categoryTag,
        skillTags: '[]',
        renderLevel: item.renderLevel,
        recommendation: item.recommendation,
        score: meta?.score ?? 0,
        source: meta?.source ?? null,
        briefDate: date,
        classifiedAt: new Date(),
      };
    });

  if (rows.length === 0) {
    console.log('[db-writer] No articles to write');
    return;
  }

  await db
    .insert(articles)
    .values(rows)
    .onConflictDoUpdate({
      target: articles.url,
      set: {
        title: sql`excluded.title`,
        summary: sql`excluded.summary`,
        context: sql`excluded.context`,
        engineeringImpact: sql`excluded.engineering_impact`,
        reason: sql`excluded.reason`,
        shortJudgment: sql`excluded.short_judgment`,
        categoryTag: sql`excluded.category_tag`,
        renderLevel: sql`excluded.render_level`,
        recommendation: sql`excluded.recommendation`,
        score: sql`excluded.score`,
        briefDate: sql`excluded.brief_date`,
        classifiedAt: sql`excluded.classified_at`,
      },
    });

  console.log(`[db-writer] Upserted ${rows.length} articles for ${date}`);
}