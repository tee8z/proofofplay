use game_engine::{config::GameConfig, engine::replay, state::decode_inputs};

pub struct ReplayResult {
    pub score: u32,
    pub level: u32,
    pub frames: u32,
    pub game_over: bool,
    pub verified: bool,
}

pub fn verify_replay(
    seed: u64,
    config: &GameConfig,
    input_log: &[u8],
    frame_count: u32,
    claimed_score: u32,
) -> ReplayResult {
    let inputs = decode_inputs(input_log, frame_count);
    let (score, level, frames, game_over) = replay(seed, config.clone(), &inputs);
    ReplayResult {
        score,
        level,
        frames,
        game_over,
        verified: score == claimed_score,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use game_engine::state::{encode_inputs, FrameInput};

    #[test]
    fn test_verify_replay_matches() {
        let config = GameConfig::default_config();
        let seed = 42u64;

        // Play a short game
        let inputs: Vec<FrameInput> = (0..100)
            .map(|i| FrameInput {
                thrust: i % 5 == 0,
                rotate_left: i % 7 == 0,
                rotate_right: i % 11 == 0,
                shoot: i % 13 == 0,
            })
            .collect();

        // Get the real score by replaying
        let (real_score, _, _, _) = replay(seed, config.clone(), &inputs);

        // Encode inputs
        let encoded = encode_inputs(&inputs);

        // Verify
        let result = verify_replay(seed, &config, &encoded, 100, real_score);
        assert!(result.verified);
        assert_eq!(result.score, real_score);
    }

    #[test]
    fn test_verify_replay_rejects_fake_score() {
        let config = GameConfig::default_config();
        let seed = 42u64;

        let inputs: Vec<FrameInput> = (0..50)
            .map(|_| FrameInput {
                thrust: false,
                rotate_left: false,
                rotate_right: false,
                shoot: false,
            })
            .collect();

        let encoded = encode_inputs(&inputs);

        // Claim a fake score
        let result = verify_replay(seed, &config, &encoded, 50, 999999);
        assert!(!result.verified);
    }
}
