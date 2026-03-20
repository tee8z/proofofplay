# astroid_comp

Daily competitive Asteroids arcade game with Bitcoin Lightning payments and a Nostr audit ledger.

Players pay a small entry fee in sats to play, compete on daily leaderboards, and the top scorer each day wins 90% of the prize pool.

## Architecture

```
Browser (WASM)                          Server (Axum)
┌─────────────────────┐                ┌──────────────────────────────┐
│  game_engine (WASM) │                │  game sessions & scoring     │
│  nostr_signer (WASM)│◄──REST API────►│  payment management          │
│  public_ui (HTML/JS)│                │  Lightning (Voltage / LND)   │
└─────────────────────┘                │  Nostr audit ledger          │
                                       │  SQLite                      │
                                       └──────────────────────────────┘
```

### Crates

| Crate | Target | Description |
|-------|--------|-------------|
| `game_engine` | WASM + native | Deterministic asteroids engine with fixed-point math and seeded RNG. Given the same seed, config, and inputs, produces identical results everywhere. |
| `nostr_signer` | WASM | Browser-side Nostr key management, NIP-07 extension signing, NIP-98 HTTP auth. |
| `server` | native | Axum web server: game sessions, Lightning payments, score validation, daily prize distribution, Nostr audit ledger. |
| `public_ui` | static | HTML/JS/CSS served by the server. HTMX fragments for leaderboard updates. |

## How It Works Today

### Game Flow

```
Player                          Server                         Lightning
  │                               │                               │
  ├──POST /game/session──────────►│                               │
  │                               ├──create invoice (500 sats)───►│
  │◄──402 + invoice──────────────┤                               │
  │                               │                               │
  │──pays Lightning invoice──────────────────────────────────────►│
  │                               │                               │
  ├──POST /game/session──────────►│                               │
  │                               ├──check payment status────────►│
  │◄──200 + session_id + config──┤◄──paid────────────────────────┤
  │                               │                               │
  │  (plays game in browser WASM) │                               │
  │                               │                               │
  ├──POST /game/score────────────►│                               │
  │                               ├──save score                   │
  │                               ├──publish to Nostr ledger      │
  │◄──200 + score confirmation───┤                               │
```

### Entry Fee & Prize Pool

- **Entry fee**: 500 sats per game
- **Server take**: 50 sats (10%)
- **Daily prize pool**: 450 sats × number of games played that day
- **Winner**: Highest single score for the day
- **Prize window**: Daily tasks run at ~00:05 UTC, processing the previous day's results

### Payment Providers

The server supports two Lightning backends, configured via `ln_settings.provider`:

- **Voltage** (default): Hosted Lightning wallet via REST API. Invoices are created and polled asynchronously.
- **LND**: Direct connection to an LND node via REST + macaroon auth.

### Session & Difficulty

Each game session tracks activity time. The longer a session runs, the harder it gets:

```
difficulty = min(1.0 + (minutes_active × 0.1), 3.0)
```

This scales asteroid count, asteroid speed, and points per asteroid. A 20-minute session maxes out at 3× difficulty.

### Deterministic Game Engine

The game engine compiles to both WASM (browser) and native (server-side verification). All game state is deterministic:

- **Seeded RNG**: Asteroid positions, polygon vertices, spawn locations
- **Fixed-point arithmetic**: Custom `Fixed` type avoids floating-point non-determinism
- **Replay-ready**: Given a seed + config + input sequence, the exact same game plays out frame-by-frame

This enables future server-side replay verification — the seed, config, and input log are stored per session.

### Scoring

```
score += points_per_asteroid × current_level
```

Levels advance when all asteroids are destroyed. Each level spawns `initial_count × √(level)` asteroids with 10% speed increase per level.

### Cheating, Bots, and Score Integrity

The current trust model has a significant gap: **scores are client-reported**. When a player submits `POST /game/score`, the server receives `{score, level, play_time, session_id}` and saves it directly. There is no server-side verification that the score was actually achieved through gameplay.

#### Current Attack Vectors

**1. Fabricated Scores**
A player can intercept the score submission request and POST any score they want. No proof of gameplay is required — just a valid session ID and Nostr auth.

**2. Bot Play**
An automated client can play the game optimally. Since the game engine is WASM running in the browser, a bot can:
- Hook into the WASM exports to read game state (asteroid positions, velocities)
- Compute perfect inputs every frame (optimal thrust, rotation, and shooting)
- Submit legitimate-looking scores that are technically achievable but superhuman

**3. Modified Client**
A player can modify the JavaScript or WASM binary to:
- Remove collision detection (invincibility)
- Auto-aim bullets
- Slow down game speed while keeping frame counter normal
- Directly manipulate `GameState` in memory

**4. Session Replay Abuse**
A player with one valid payment could attempt to submit multiple scores against the same session, or re-use session IDs.

#### Existing Mitigations

- **Payment gating**: Each session requires a 500 sat Lightning payment, making spam expensive
- **Session ownership**: Score submissions are verified against the session's `user_id`
- **Nostr authentication**: Every API call requires a signed NIP-98 event, tying actions to a keypair

#### Planned: Deterministic Replay Verification

The infrastructure for replay verification exists but is not yet wired up:

- **Schema ready**: `game_sessions.seed`, `game_input_logs.input_log`, `game_input_logs.input_hash` columns exist
- **Engine ready**: `GameState::new(seed, config)` + `tick(input)` is fully deterministic with fixed-point math
- **Ledger ready**: `score_verified` events have fields for `seed`, `frames`, and `input_hash` (currently empty)

When completed, the flow would be:

```
1. Server generates seed → sends to client with config
2. Client plays game, recording FrameInput per tick
3. Client submits: score + compressed input log + input_hash
4. Server replays: GameState::new(seed, config) → tick(inputs[0..N])
5. Server verifies: replayed score == submitted score
6. If match → accept. If mismatch → reject.
```

This eliminates fabricated scores entirely. The seed is server-generated (player can't choose favorable asteroid spawns), and the input log is the only thing the player controls. The server re-derives the score independently.

**What replay verification does NOT solve**: bots. A bot can produce a valid input log that replays correctly — the inputs are legitimate, they're just computed by software instead of a human. Bot detection would require heuristics (input timing analysis, reaction time distributions, movement pattern entropy) which are a separate layer.

### Nostr Audit Ledger

The Nostr audit ledger creates a cryptographically signed, publicly verifiable record of all game activity. Every significant event is signed with the server's Nostr keypair and stored as a Kind 10100 event.

#### Why Nostr

- **Signed events**: Each ledger entry is a Nostr event signed by the server's key. Anyone can verify the signature — the server can't retroactively alter records.
- **Public auditability**: Events can be published to Nostr relays, making the game's history inspectable by anyone. Even without relay publishing, the local ledger is signed and tamper-evident.
- **Player identity**: Players already authenticate via Nostr (NIP-98). Their pubkeys are the natural identifier for ledger entries, creating a unified identity across auth and audit.

#### Event Types

| Event | Tags | What It Proves |
|-------|------|----------------|
| `game_entry` | player pubkey, payment_id, amount, session_id, date | Player paid the entry fee. Links payment to session. |
| `score_verified` | player pubkey, session_id, seed, score, level, frames, input_hash | Score was submitted (and once replay is live, verified). The `seed` + `input_hash` enable independent replay by anyone with the game engine. |
| `competition_result` | date, winner pubkey, score, total_games, pool, prize | Daily winner was determined. Shows total pool size and prize amount — anyone can verify the 90% split math. |
| `prize_payout` | player pubkey, date, amount, payment_id | Prize was actually paid. The `payment_id` can be cross-referenced against Lightning payment records. |

#### What The Ledger Enables

**For players**: Verify that the prize pool math is correct (entry fees × 90% = prize), that the highest score actually won, and that payouts were made.

**For disputes**: If a player claims they won but didn't receive payment, the ledger shows whether `competition_result` was published and whether `prize_payout` followed. Gaps in the chain are visible.

**For replay verification** (future): The `score_verified` event contains the `seed` and `input_hash`. Combined with the game config and the stored input log, anyone can re-run the game engine and independently verify that the score is legitimate. This turns the audit from "server says this score happened" to "here's the cryptographic proof — verify it yourself."

**For the Ark covenant model** (future): The ledger becomes the oracle's public attestation channel. When the server publishes the `competition_result` event with the winner's pubkey, that same attestation (or its underlying scalar) is what unlocks the winner's covenant-locked VTXO. The Nostr event is both the human-readable announcement and the machine-verifiable proof.

### Authentication

Players authenticate via Nostr (NIP-98 HTTP Auth). The browser-side `nostr_signer` WASM crate handles key management and event signing. Users are auto-created on first login.

### Prize Claiming

1. Daily tasks identify yesterday's top scorer at ~00:05 UTC
2. Winner checks eligibility: `GET /prizes/check`
3. Winner submits their Lightning invoice: `POST /prizes/claim`
4. Server pays the invoice via Voltage/LND (1% fee limit)

### API

```
# Auth
POST /api/v1/users/login              Nostr NIP-98 login (auto-creates user)
POST /api/v1/users/register            Register with custom username

# Game
GET  /api/v1/game/config               Get game config (optionally with session_id)
POST /api/v1/game/session              Create new session (returns 402 if unpaid)
POST /api/v1/game/score                Submit final score
GET  /api/v1/game/scores/top           Top 10 scores
GET  /api/v1/game/scores/user          User's best 10 scores

# Payments
GET  /api/v1/payments/status/:id       Check payment status

# Prizes
GET  /api/v1/prizes/check              Check prize eligibility
POST /api/v1/prizes/claim              Claim prize with Lightning invoice

# Ledger
GET  /api/v1/ledger/events             Browse audit events
GET  /api/v1/ledger/pubkey             Server's Nostr pubkey
GET  /api/v1/ledger/summary            Ledger stats
```

## Setup

### Database

```bash
sqlx database create --database-url sqlite:./data/game.db
sqlx migrate run --database-url sqlite:./data/game.db --source ./crates/server/migrations
```

### Configuration

```bash
cp config/local.example.toml config/local.toml
```

Edit `config/local.toml` with your Lightning node details. Two providers are supported:

**LND** (direct node connection):
```toml
[ln_settings]
provider = "lnd"
lnd_base_url = "https://your-lnd-node.example.com"
lnd_macaroon_path = "/absolute/path/to/admin.macaroon"
# lnd_tls_cert_path = "/absolute/path/to/tls.cert"  # only for self-signed certs
```

**Voltage** (hosted wallet API):
```toml
[ln_settings]
provider = "voltage"

[api_settings]
voltage_api_key = "your-api-key"
voltage_api_url = "https://voltageapi.com/v1/"
voltage_org_id = "your-org-id"
voltage_env_id = "your-env-id"
voltage_wallet_id = "your-wallet-id"
```

See `config/local.example.toml` for the full template.

### Run

```bash
cargo run --release -- -c config/local.toml
```
