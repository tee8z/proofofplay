-- SQLite doesn't support DROP COLUMN easily, so this is a no-op
DROP INDEX IF EXISTS idx_game_sessions_client_ip;
DROP INDEX IF EXISTS idx_game_sessions_start_time;
