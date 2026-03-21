use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use game_engine::config::GameConfig as EngineConfig;
use serde::{Deserialize, Serialize};
use sqlx::{Pool, Sqlite};
use time::{Duration, OffsetDateTime};
use uuid::Uuid;

use crate::domain::Error;

fn base64_encode(data: &[u8]) -> String {
    BASE64.encode(data)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSession {
    pub id: i64,
    pub session_id: String,
    pub user_id: i64,
    pub start_time: String,
    pub last_active: String,
    pub difficulty_factor: f64,
    pub seed: Option<String>,
    pub engine_config: Option<String>,
    pub client_ip: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfig {
    pub id: i64,
    pub config_id: String,
    pub user_id: i64,
    pub version: String,
    pub created_at: String,
    pub expiration_time: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Score {
    pub id: i64,
    pub user_id: i64,
    pub score: i64,
    pub level: i64,
    pub play_time: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreWithUsername {
    pub id: i64,
    pub username: String,
    pub score: i64,
    pub level: i64,
    pub play_time: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplayData {
    pub username: String,
    pub score: i64,
    pub level: i64,
    pub frames: i64,
    pub seed: String,
    pub engine_config: String,
    pub input_log_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameConfigResponse {
    pub version: String,
    pub config_id: String,
    pub session_id: String,
    pub expiration_time: u64,
    pub fps: u64,
    pub seed: String,
    pub engine_config: serde_json::Value,
    pub ship: ShipConfig,
    pub bullets: BulletsConfig,
    pub asteroids: AsteroidsConfig,
    pub scoring: ScoringConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipConfig {
    pub radius: u64,
    pub turn_speed: f64,
    pub thrust: f64,
    pub friction: f64,
    pub invulnerability_time: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BulletsConfig {
    pub speed: u64,
    pub radius: u64,
    pub max_count: u64,
    pub life_time: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AsteroidsConfig {
    pub initial_count: u64,
    pub speed: u64,
    pub size: u64,
    pub vertices: VerticesConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerticesConfig {
    pub min: u64,
    pub max: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringConfig {
    pub points_per_asteroid: u64,
    pub level_multiplier: f64,
}

pub struct ScoreMetadata {
    pub score_id: i64,
    pub session_id: String,
    pub user_id: i64,
    pub username: String,
    pub client_ip: Option<String>,
    pub score: i64,
    pub level: i64,
    pub frames: u32,
    pub play_time: i64,
    pub server_elapsed_secs: f64,
    pub expected_play_secs: f64,
    pub server_timing_ratio: f64,
    pub client_claimed_secs: Option<f64>,
    pub timing_cross_ref_ratio: Option<f64>,
    pub timing_variance_us2: Option<f64>,
    pub timing_mean_offset_us: Option<f64>,
    pub ip_session_count: Option<i64>,
    pub ip_account_count: Option<i64>,
    pub flags: Vec<String>,
    pub rejected: bool,
}

#[derive(Debug, Clone)]
pub struct GameStore {
    db: Pool<Sqlite>,
}

impl GameStore {
    pub fn new(db: Pool<Sqlite>) -> Self {
        Self { db }
    }

    pub fn get_pool(&self) -> Pool<Sqlite> {
        self.db.clone()
    }

    pub async fn ping(&self) -> Result<(), Error> {
        sqlx::query!("SELECT 1 as ping").fetch_one(&self.db).await?;
        Ok(())
    }

    pub async fn create_session(
        &self,
        user_id: i64,
        client_ip: &str,
    ) -> Result<GameSession, Error> {
        let session_id = format!("session_{}", Uuid::now_v7());
        let now = OffsetDateTime::now_utc().to_string();

        let seed: u64 = rand::random();
        let seed_hex = format!("{:016x}", seed);

        // Build deterministic engine config
        let engine_config = EngineConfig::default_config();
        let engine_config_json = serde_json::to_string(&engine_config).map_err(|e| {
            Error::InvalidInput(format!("Failed to serialize engine config: {}", e))
        })?;

        let session_id_clone = session_id.clone();

        let id = sqlx::query(
            "INSERT INTO game_sessions (session_id, user_id, start_time, last_active, difficulty_factor, seed, engine_config, client_ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(&session_id)
        .bind(user_id)
        .bind(&now)
        .bind(&now)
        .bind(1.0f64)
        .bind(&seed_hex)
        .bind(&engine_config_json)
        .bind(client_ip)
        .execute(&self.db)
        .await?
        .last_insert_rowid();

        Ok(GameSession {
            id,
            session_id: session_id_clone,
            user_id,
            start_time: now.clone(),
            last_active: now,
            difficulty_factor: 1.0,
            seed: Some(seed_hex),
            engine_config: Some(engine_config_json),
            client_ip: Some(client_ip.to_string()),
        })
    }

    pub async fn find_session(&self, session_id: &str) -> Result<Option<GameSession>, Error> {
        let row = sqlx::query(
            "SELECT id, session_id, user_id, start_time, last_active, difficulty_factor, seed, engine_config, client_ip FROM game_sessions WHERE session_id = ?"
        )
        .bind(session_id)
        .fetch_optional(&self.db)
        .await?;

        Ok(row.map(|r| {
            use sqlx::Row;
            GameSession {
                id: r.get("id"),
                session_id: r.get("session_id"),
                user_id: r.get("user_id"),
                start_time: r.get("start_time"),
                last_active: r.get("last_active"),
                difficulty_factor: r.get("difficulty_factor"),
                seed: r.get("seed"),
                engine_config: r.get("engine_config"),
                client_ip: r.get("client_ip"),
            }
        }))
    }

    pub async fn update_session_activity(&self, session_id: &str) -> Result<GameSession, Error> {
        let now = OffsetDateTime::now_utc().to_string();

        // Find the existing session
        let session = match self.find_session(session_id).await? {
            Some(s) => s,
            None => {
                return Err(Error::NotFound(format!(
                    "Session not found: {}",
                    session_id
                )))
            }
        };

        // Calculate how long the session has been active
        let start = OffsetDateTime::parse(
            &session.start_time,
            &time::format_description::well_known::Iso8601::DEFAULT,
        )
        .map_err(|_| {
            Error::InvalidInput("Invalid date format in session start time".to_string())
        })?;

        let current = OffsetDateTime::now_utc();
        let duration_minutes = (current - start).whole_minutes() as f64;

        // Calculate difficulty factor (10% increase per minute, max 3x)
        let difficulty = (1.0 + (duration_minutes * 0.1)).min(3.0);

        // Update the session
        sqlx::query!(
            r#"
            UPDATE game_sessions
            SET last_active = ?, difficulty_factor = ?
            WHERE session_id = ?
            "#,
            now,
            difficulty,
            session_id
        )
        .execute(&self.db)
        .await?;

        Ok(GameSession {
            id: session.id,
            session_id: session.session_id,
            user_id: session.user_id,
            start_time: session.start_time,
            last_active: now,
            difficulty_factor: difficulty,
            seed: session.seed,
            engine_config: session.engine_config,
            client_ip: session.client_ip,
        })
    }

    pub async fn create_game_config(
        &self,
        session: &GameSession,
    ) -> Result<GameConfigResponse, Error> {
        let config_id = format!("config_{}", Uuid::now_v7());
        let version = "1.0.0".to_string();
        let expiration_time = (OffsetDateTime::now_utc() + Duration::minutes(5)).to_string();
        let now = OffsetDateTime::now_utc().to_string();

        // Store config in database
        sqlx::query!(
            r#"
            INSERT INTO game_configs (config_id, user_id, version, created_at, expiration_time)
            VALUES (?, ?, ?, ?, ?)
            "#,
            config_id,
            session.user_id,
            version,
            now,
            expiration_time
        )
        .execute(&self.db)
        .await?;

        // Calculate expiration time in milliseconds
        let expiration_ms =
            (OffsetDateTime::now_utc() + Duration::minutes(5)).unix_timestamp() * 1000;

        // Apply difficulty factor from session
        let difficulty = session.difficulty_factor;

        // Parse the stored engine config, or use default
        let engine_config_value: serde_json::Value = session
            .engine_config
            .as_ref()
            .and_then(|c| serde_json::from_str(c).ok())
            .unwrap_or_else(|| serde_json::to_value(EngineConfig::default_config()).unwrap());

        let seed = session.seed.clone().unwrap_or_default();

        // Return config with difficulty scaling
        Ok(GameConfigResponse {
            version,
            config_id,
            session_id: session.session_id.clone(),
            expiration_time: expiration_ms as u64,
            fps: 60,
            seed,
            engine_config: engine_config_value,
            ship: ShipConfig {
                radius: 10,
                turn_speed: 0.1,
                thrust: 0.1,
                friction: 0.05,
                invulnerability_time: 3000,
            },
            bullets: BulletsConfig {
                speed: 5,
                radius: 2,
                max_count: 10,
                life_time: 60,
            },
            asteroids: AsteroidsConfig {
                initial_count: (5.0 * difficulty) as u64,
                speed: (1.0 * difficulty) as u64,
                size: 30,
                vertices: VerticesConfig { min: 7, max: 15 },
            },
            scoring: ScoringConfig {
                points_per_asteroid: (10.0 * difficulty) as u64,
                level_multiplier: 1.5,
            },
        })
    }

    pub async fn submit_score(
        &self,
        user_id: i64,
        score: i64,
        level: i64,
        play_time: i64,
    ) -> Result<Score, Error> {
        let now = OffsetDateTime::now_utc().to_string();

        // Save the score
        let id = sqlx::query!(
            r#"
            INSERT INTO scores (user_id, score, level, play_time, created_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
            user_id,
            score,
            level,
            play_time,
            now
        )
        .execute(&self.db)
        .await?
        .last_insert_rowid();

        Ok(Score {
            id,
            user_id,
            score,
            level,
            play_time,
            created_at: now,
        })
    }

    pub async fn get_top_scores(&self, limit: i64) -> Result<Vec<ScoreWithUsername>, Error> {
        let scores = sqlx::query!(
            r#"
            SELECT s.id, s.user_id, s.score, s.level, s.play_time, s.created_at, u.username
            FROM scores s
            JOIN users u ON s.user_id = u.id
            ORDER BY s.score DESC
            LIMIT ?
            "#,
            limit
        )
        .fetch_all(&self.db)
        .await?
        .into_iter()
        .map(|row| ScoreWithUsername {
            id: row.id,
            username: row.username,
            score: row.score,
            level: row.level,
            play_time: row.play_time,
            created_at: row.created_at,
        })
        .collect();

        Ok(scores)
    }

    pub async fn get_user_scores(&self, user_id: i64, limit: i64) -> Result<Vec<Score>, Error> {
        let scores = sqlx::query_as!(
            Score,
            r#"
            SELECT id, user_id, score, level, play_time, created_at
            FROM scores
            WHERE user_id = ?
            ORDER BY score DESC
            LIMIT ?
            "#,
            user_id,
            limit
        )
        .fetch_all(&self.db)
        .await?;

        Ok(scores)
    }

    pub async fn get_ip_activity(&self, client_ip: &str) -> Result<(i64, i64), Error> {
        let row = sqlx::query(
            "SELECT COUNT(*) as session_count, COUNT(DISTINCT user_id) as account_count FROM game_sessions WHERE client_ip = ? AND start_time >= datetime('now', '-1 hour')"
        )
        .bind(client_ip)
        .fetch_one(&self.db)
        .await?;

        use sqlx::Row;
        Ok((row.get("session_count"), row.get("account_count")))
    }

    pub async fn save_score_metadata(&self, meta: &ScoreMetadata) -> Result<(), Error> {
        let flags = if meta.flags.is_empty() {
            None
        } else {
            Some(meta.flags.join(","))
        };
        sqlx::query(
            "INSERT INTO score_metadata (score_id, session_id, user_id, username, client_ip, score, level, frames, play_time, server_elapsed_secs, expected_play_secs, server_timing_ratio, client_claimed_secs, timing_cross_ref_ratio, timing_variance_us2, timing_mean_offset_us, ip_session_count, ip_account_count, flags, rejected) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(meta.score_id)
        .bind(&meta.session_id)
        .bind(meta.user_id)
        .bind(&meta.username)
        .bind(&meta.client_ip)
        .bind(meta.score)
        .bind(meta.level)
        .bind(meta.frames)
        .bind(meta.play_time)
        .bind(meta.server_elapsed_secs)
        .bind(meta.expected_play_secs)
        .bind(meta.server_timing_ratio)
        .bind(meta.client_claimed_secs)
        .bind(meta.timing_cross_ref_ratio)
        .bind(meta.timing_variance_us2)
        .bind(meta.timing_mean_offset_us)
        .bind(meta.ip_session_count)
        .bind(meta.ip_account_count)
        .bind(flags)
        .bind(meta.rejected as i32)
        .execute(&self.db)
        .await?;
        Ok(())
    }

    /// Get top scored games with full replay data for today.
    /// Returns seed, engine_config, input_log, frames, score, username.
    pub async fn get_top_replays(&self, limit: i64) -> Result<Vec<ReplayData>, Error> {
        let today = OffsetDateTime::now_utc().date().to_string();
        let start = format!("{} 00:00:00", today);
        let end = format!("{} 23:59:59", today);

        let rows = sqlx::query(
            r#"
            SELECT
                sm.username,
                sm.score,
                sm.level,
                sm.frames,
                gs.seed,
                gs.engine_config,
                gil.input_log
            FROM score_metadata sm
            JOIN game_sessions gs ON gs.session_id = sm.session_id
            JOIN game_input_logs gil ON gil.session_id = sm.session_id
            WHERE sm.created_at >= ? AND sm.created_at <= ?
              AND sm.rejected = 0
              AND gs.seed IS NOT NULL
              AND gs.engine_config IS NOT NULL
            ORDER BY sm.score DESC
            LIMIT ?
            "#,
        )
        .bind(&start)
        .bind(&end)
        .bind(limit)
        .fetch_all(&self.db)
        .await?;

        let mut replays = Vec::new();
        for row in rows {
            use sqlx::Row;
            let input_log: Vec<u8> = row.try_get("input_log")?;
            replays.push(ReplayData {
                username: row.try_get("username")?,
                score: row.try_get("score")?,
                level: row.try_get("level")?,
                frames: row.try_get("frames")?,
                seed: row.try_get("seed")?,
                engine_config: row.try_get("engine_config")?,
                input_log_base64: base64_encode(&input_log),
            });
        }

        Ok(replays)
    }

    pub async fn save_input_log(
        &self,
        session_id: &str,
        input_log: &[u8],
        input_hash: &str,
    ) -> Result<(), Error> {
        let now = OffsetDateTime::now_utc().to_string();
        sqlx::query(
            "INSERT INTO game_input_logs (session_id, input_log, input_hash, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(session_id) DO UPDATE SET input_log = excluded.input_log, input_hash = excluded.input_hash"
        )
        .bind(session_id)
        .bind(input_log)
        .bind(input_hash)
        .bind(&now)
        .execute(&self.db)
        .await?;
        Ok(())
    }
}
