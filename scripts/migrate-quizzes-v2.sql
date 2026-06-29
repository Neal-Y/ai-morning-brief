-- Quiz schema v2 migration (曉得 Quiz pivot, 2026-06-23).
-- Run this against Turso BEFORE deploying any code that reads/writes `quizzes`.
--
-- The old `quizzes` table was built for the abandoned V1 "晨間 Recall Quiz"
-- feature (free-text question/answer tied 1:1 to an article). It was never
-- wired up to the pipeline and has 0 rows in production, so this is a clean
-- DROP + recreate, not a data-preserving migration.
--
-- New shape: quizzes are independent of articles, support 4 question types
-- via a polymorphic `payload` JSON column (see src/quiz/types.ts), and
-- per-device answer history lives in a separate `quiz_attempts` table
-- (mirrors the articles/feedback split already used elsewhere in this DB).

DROP TABLE IF EXISTS quizzes;

CREATE TABLE quizzes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,            -- 'single_choice' | 'ordering' | 'matching' | 'fill_blank'
  category    TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  payload     TEXT NOT NULL,            -- JSON, shape depends on `type`
  explanation TEXT NOT NULL,
  source_name TEXT,
  source_url  TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE quiz_attempts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  quiz_id      INTEGER NOT NULL REFERENCES quizzes(id),
  device_id    TEXT,
  correct      INTEGER NOT NULL,        -- 0/1
  answered_at  INTEGER NOT NULL
);
