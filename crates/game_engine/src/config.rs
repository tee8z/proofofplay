use crate::fixed::Fixed;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameConfig {
    pub canvas_width: Fixed,
    pub canvas_height: Fixed,
    pub ship: ShipConfig,
    pub bullets: BulletConfig,
    pub asteroids: AsteroidConfig,
    pub scoring: ScoringConfig,
    #[serde(default = "LivesConfig::default_lives")]
    pub lives: LivesConfig,
    #[serde(default = "EnemyConfig::default_config")]
    pub enemies: EnemyConfig,
}

impl LivesConfig {
    fn default_lives() -> Self {
        LivesConfig {
            starting_lives: 3,
            max_lives: 5,
        }
    }
}

impl EnemyConfig {
    fn default_config() -> Self {
        EnemyConfig {
            drone_start_level: 3,
            fighter_start_level: 5,
            bomber_start_level: 7,
            drone_shoot_cooldown: 120,  // 2 seconds at 60fps
            fighter_shoot_cooldown: 90, // 1.5 seconds
            enemy_bullet_speed: Fixed::from(3),
            enemy_bullet_lifetime: 90, // 1.5 seconds
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShipConfig {
    pub radius: Fixed,
    /// Angle units per frame (in 256-unit circle).
    pub turn_speed: Fixed,
    pub thrust: Fixed,
    /// Friction coefficient: velocity *= (1 - friction) when not thrusting.
    pub friction: Fixed,
    /// Number of frames of invulnerability (180 = 3 seconds at 60fps).
    pub invulnerability_frames: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BulletConfig {
    pub speed: Fixed,
    pub radius: Fixed,
    pub max_count: u32,
    /// Bullet lifetime in frames.
    pub life_time: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AsteroidConfig {
    pub initial_count: u32,
    pub speed: Fixed,
    /// Radius.
    pub size: Fixed,
    pub vertices_min: u32,
    pub vertices_max: u32,
    /// Minimum level at which Medium asteroids split into Small.
    /// Below this level, Medium asteroids are destroyed without spawning fragments.
    #[serde(default = "default_min_split_level")]
    pub min_split_level: u32,
}

fn default_min_split_level() -> u32 {
    3
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ScoringConfig {
    pub points_per_asteroid: u32,
    /// Unused in current scoring, kept for config compatibility.
    pub level_multiplier: Fixed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LivesConfig {
    pub starting_lives: u32,
    pub max_lives: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EnemyConfig {
    /// Level at which drones start appearing
    pub drone_start_level: u32,
    /// Level at which fighters start appearing
    pub fighter_start_level: u32,
    /// Level at which bombers start appearing
    pub bomber_start_level: u32,
    /// Drone shoot cooldown in frames
    pub drone_shoot_cooldown: u32,
    /// Fighter shoot cooldown in frames
    pub fighter_shoot_cooldown: u32,
    /// Enemy bullet speed
    pub enemy_bullet_speed: Fixed,
    /// Enemy bullet lifetime in frames
    pub enemy_bullet_lifetime: u32,
}

impl GameConfig {
    /// Returns a default config matching the original JS game.
    pub fn default_config() -> Self {
        GameConfig {
            canvas_width: Fixed::from(800),
            canvas_height: Fixed::from(600),
            ship: ShipConfig {
                radius: Fixed::from(10),
                turn_speed: Fixed::from_ratio(3, 1), // ~4.2 degrees per frame
                thrust: Fixed::from_ratio(1, 10),    // 0.1 per frame
                friction: Fixed::from_ratio(1, 20),  // 0.05
                invulnerability_frames: 180,
            },
            bullets: BulletConfig {
                speed: Fixed::from(5),
                radius: Fixed::from(2),
                max_count: 10,
                life_time: 60,
            },
            asteroids: AsteroidConfig {
                initial_count: 5,
                speed: Fixed::from(1),
                size: Fixed::from(30),
                vertices_min: 7,
                vertices_max: 15,
                min_split_level: 3,
            },
            scoring: ScoringConfig {
                points_per_asteroid: 10,
                level_multiplier: Fixed::ONE,
            },
            lives: LivesConfig {
                starting_lives: 3,
                max_lives: 5,
            },
            enemies: EnemyConfig::default_config(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_json_round_trip() {
        let config = GameConfig::default_config();
        let json = serde_json::to_string(&config).unwrap();

        // Verify JSON contains human-readable numbers, not raw fixed-point
        assert!(json.contains("800"), "canvas_width should serialize as 800");
        assert!(
            json.contains("600"),
            "canvas_height should serialize as 600"
        );

        // Round-trip: deserialize back
        let config2: GameConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(config.canvas_width, config2.canvas_width);
        assert_eq!(config.canvas_height, config2.canvas_height);
        assert_eq!(config.ship.radius, config2.ship.radius);
        assert_eq!(
            config.asteroids.initial_count,
            config2.asteroids.initial_count
        );
    }

    #[test]
    fn test_config_from_js_style_json() {
        // This is the kind of JSON that JS/server would send
        let json = r#"{
            "canvas_width": 800,
            "canvas_height": 600,
            "ship": {
                "radius": 10,
                "turn_speed": 3.0,
                "thrust": 0.1,
                "friction": 0.05,
                "invulnerability_frames": 180
            },
            "bullets": {
                "speed": 5,
                "radius": 2,
                "max_count": 10,
                "life_time": 60
            },
            "asteroids": {
                "initial_count": 5,
                "speed": 1,
                "size": 30,
                "vertices_min": 7,
                "vertices_max": 15
            },
            "scoring": {
                "points_per_asteroid": 10,
                "level_multiplier": 1.0
            }
        }"#;

        let config: GameConfig = serde_json::from_str(json).unwrap();
        assert_eq!(config.canvas_width, Fixed::from(800));
        assert_eq!(config.canvas_height, Fixed::from(600));
        assert_eq!(config.ship.radius, Fixed::from(10));
        assert_eq!(config.bullets.speed, Fixed::from(5));
    }
}
