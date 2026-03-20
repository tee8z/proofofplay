ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN encrypted_nsec TEXT;

-- Partial unique index: only enforce uniqueness for username/password users
CREATE UNIQUE INDEX idx_users_username_auth ON users (username) WHERE password_hash IS NOT NULL;
