-- Denormalized table for dashboard queries.
-- One row per score submission with all bot detection signals in one place.
-- Grafana queries this directly — no need for joins.
CREATE TABLE score_metadata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    score_id INTEGER NOT NULL,
    session_id TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    client_ip TEXT,
    score INTEGER NOT NULL,
    level INTEGER NOT NULL,
    frames INTEGER NOT NULL,
    play_time INTEGER NOT NULL,

    -- Server-measured timing (unforgeable)
    server_elapsed_secs REAL NOT NULL,
    expected_play_secs REAL NOT NULL,
    server_timing_ratio REAL NOT NULL,

    -- Client-reported timing
    client_claimed_secs REAL,
    timing_cross_ref_ratio REAL,
    timing_variance_us2 REAL,
    timing_mean_offset_us REAL,

    -- IP activity at time of submission
    ip_session_count INTEGER,
    ip_account_count INTEGER,

    -- Bot detection result
    flags TEXT,           -- comma-separated flag strings, NULL = clean
    rejected INTEGER NOT NULL DEFAULT 0,

    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_score_metadata_created_at ON score_metadata(created_at);
CREATE INDEX idx_score_metadata_client_ip ON score_metadata(client_ip);
CREATE INDEX idx_score_metadata_flags ON score_metadata(flags);
CREATE INDEX idx_score_metadata_user_id ON score_metadata(user_id);
