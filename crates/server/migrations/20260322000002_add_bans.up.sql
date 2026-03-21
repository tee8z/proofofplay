-- Track banned IPs (admin can block IPs caught botting)
CREATE TABLE IF NOT EXISTS banned_ips (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    ip TEXT NOT NULL UNIQUE,
    reason TEXT,
    banned_at TEXT NOT NULL DEFAULT (datetime('now')),
    banned_by TEXT  -- admin identifier
);

-- Flag users as banned (skipped in payouts, flagged on leaderboard)
ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN ban_reason TEXT;
