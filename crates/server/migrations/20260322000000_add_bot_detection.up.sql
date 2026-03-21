ALTER TABLE game_sessions ADD COLUMN client_ip TEXT;
ALTER TABLE game_input_logs ADD COLUMN frame_timings BLOB;
ALTER TABLE scores ADD COLUMN flags TEXT DEFAULT NULL;

CREATE INDEX idx_game_sessions_client_ip ON game_sessions(client_ip);
CREATE INDEX idx_game_sessions_start_time ON game_sessions(start_time);
