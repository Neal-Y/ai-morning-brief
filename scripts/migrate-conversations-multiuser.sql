-- Conversations multi-user migration
-- Run this against Turso BEFORE deploying the updated ask-history.ts.
-- The new code uses ON CONFLICT(article_id, device_id) which requires the
-- composite unique constraint created here. Deploying before this migration
-- will cause all conversation saves to fail.

-- Recreate conversations with UNIQUE(article_id, device_id) instead of UNIQUE(article_id).
-- SQLite cannot drop/change unique constraints via ALTER TABLE.
CREATE TABLE conversations_new (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id    TEXT NOT NULL REFERENCES articles(id),
  device_id     TEXT,
  messages      TEXT NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  model         TEXT NOT NULL DEFAULT 'haiku',
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER,
  UNIQUE(article_id, device_id)
);
INSERT INTO conversations_new (id, article_id, device_id, messages, message_count, model, created_at, updated_at)
SELECT id, article_id, device_id, messages, message_count, model, created_at, updated_at FROM conversations;
DROP TABLE conversations;
ALTER TABLE conversations_new RENAME TO conversations;
