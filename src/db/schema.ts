import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  url: text('url').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  context: text('context').notNull(),
  engineeringImpact: text('engineering_impact').notNull(),
  reason: text('reason').notNull(),
  shortJudgment: text('short_judgment'),
  categoryTag: text('category_tag').notNull(),
  skillTags: text('skill_tags').notNull().default('[]'),
  renderLevel: text('render_level').notNull(),
  recommendation: text('recommendation').notNull(),
  score: integer('score').notNull(),
  source: text('source'),
  briefDate: text('brief_date').notNull(),
  classifiedAt: integer('classified_at', { mode: 'timestamp' }).notNull(),
})

export const feedback = sqliteTable('feedback', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull().references(() => articles.id),
  signal: text('signal').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const saves = sqliteTable('saves', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull().unique().references(() => articles.id),
  userNote: text('user_note'),
  notionPageId: text('notion_page_id'),
  notionSyncingAt: integer('notion_syncing_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),
})

export const conversations = sqliteTable('conversations', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull().unique().references(() => articles.id),
  messages: text('messages').notNull().default('[]'),
  messageCount: integer('message_count').notNull().default(0),
  model: text('model').notNull().default('haiku'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
})

export const quizzes = sqliteTable('quizzes', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull().references(() => articles.id),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  lastShownAt: integer('last_shown_at', { mode: 'timestamp' }),
  userRecall: text('user_recall'),
})

export const pushSubscriptions = sqliteTable('push_subscriptions', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
