ALTER TABLE config ADD COLUMN updated_at TEXT;
UPDATE config SET updated_at = datetime('now') WHERE updated_at IS NULL;
