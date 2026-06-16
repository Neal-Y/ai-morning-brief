-- Multi-user migration
-- Run this against Turso via web console or CLI before deploying the multi-user feature.
-- Safe to run once; existing rows get device_id = NULL (treated as original owner's legacy data).
-- After deploy, run the "claim" commands at the bottom to assign your UUID to legacy rows.

-- Step 1: Add device_id to feedback, conversations, push_subscriptions (simple ADD COLUMN)
ALTER TABLE feedback ADD COLUMN device_id TEXT;
ALTER TABLE conversations ADD COLUMN device_id TEXT;
ALTER TABLE push_subscriptions ADD COLUMN device_id TEXT;

-- Step 2: Recreate saves table with composite unique (device_id, article_id)
-- SQLite does not support ALTER TABLE to drop/change unique constraints.
CREATE TABLE saves_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id  TEXT NOT NULL REFERENCES articles(id),
  device_id   TEXT,
  user_note   TEXT,
  notion_page_id TEXT,
  created_at  INTEGER NOT NULL,
  UNIQUE(device_id, article_id)
);

INSERT INTO saves_new (id, article_id, device_id, user_note, notion_page_id, created_at)
SELECT id, article_id, NULL, user_note, notion_page_id, created_at FROM saves;

DROP TABLE saves;
ALTER TABLE saves_new RENAME TO saves;

-- ─────────────────────────────────────────────────────────────────────────────
-- After deploy: claim your legacy data
-- 1. Open the app once to generate your UUID (check localStorage key 'mb_device_id')
-- 2. Replace YOUR-UUID-HERE below and run these three UPDATE statements:
-- ─────────────────────────────────────────────────────────────────────────────
-- UPDATE feedback     SET device_id = 'YOUR-UUID-HERE' WHERE device_id IS NULL;
-- UPDATE saves        SET device_id = 'YOUR-UUID-HERE' WHERE device_id IS NULL;
-- UPDATE conversations SET device_id = 'YOUR-UUID-HERE' WHERE device_id IS NULL;
