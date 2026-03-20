DROP INDEX IF EXISTS idx_users_username_auth;
-- SQLite doesn't support DROP COLUMN, so we recreate the table
CREATE TABLE users_backup AS SELECT id, nostr_pubkey, username, created_at, updated_at FROM users;
DROP TABLE users;
ALTER TABLE users_backup RENAME TO users;
