import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core'

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
  deviceId: text('device_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const saves = sqliteTable('saves', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull().references(() => articles.id),
  deviceId: text('device_id'),
  userNote: text('user_note'),
  notionPageId: text('notion_page_id'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
}, (table) => ({
  deviceArticleUnique: unique().on(table.deviceId, table.articleId),
}))

export const conversations = sqliteTable('conversations', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  articleId: text('article_id').notNull().references(() => articles.id),
  deviceId: text('device_id'),
  messages: text('messages').notNull().default('[]'),
  messageCount: integer('message_count').notNull().default(0),
  model: text('model').notNull().default('haiku'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }),
}, (table) => ({
  deviceArticleUnique: unique().on(table.articleId, table.deviceId),
}))

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
  deviceId: text('device_id'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})
