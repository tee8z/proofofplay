# Future Ideas

## Trustless Payouts via Ark Covenants + DLC Oracle

### The Problem With The Current Model

The current system is **server-custodial**: the server collects Lightning payments, determines the winner, and you trust it to actually pay out. The Nostr ledger adds transparency but not enforcement — it's an audit trail, not a contract.

### The Idea

Replace the trust-the-server model with **cryptographically enforced payouts** using:

- **[Ark protocol](https://arkdev.info/)** for off-chain Bitcoin (VTXOs with covenant spending conditions)
- **[dlctix](https://github.com/conduition/dlctix)** oracle attestation primitives for outcome signing
- **Server as DLC oracle** that attests to the daily winner

The key insight: **no MuSig2 registration window needed**. Players join throughout the day. The Ark Service Provider (ASP) manages the VTXO tree, and each player's entry is locked by a covenant script that can only be spent via the oracle's attestation. Players don't need to coordinate with each other at all.

### How It Would Work

```
Player                    Server (Oracle + ASP)              Ark
  │                            │                              │
  │──pay Lightning invoice────►│                              │
  │                            │──swap Lightning → Ark VTXO──►│
  │◄──Ark boarding address─────│  (via Boltz submarine swap)  │
  │                            │                              │
  │  Player's 500 sats are now │                              │
  │  a VTXO locked by covenant:│                              │
  │  "oracle_attestation(winner) + winner_pubkey" (win path)  │
  │  OR "timeout + player_pubkey" (full refund to player)     │
  │                            │                              │
  │  (plays game normally)     │                              │
  │                            │                              │
  │──POST /game/score─────────►│                              │
  │                            │                              │
  │          ... end of day ...│                              │
  │                            │                              │
  │                            │──determine winner             │
  │                            │──attestation_secret(winner)   │
  │                            │──publish attestation          │
  │                            │                              │
  │                            │   Winner's covenant unlocks:  │
  │                            │──send pool VTXO to winner────►│
  │◄──VTXO payout (winner)─────────────────────────────────────│
  │                            │                              │
  │  Winner can:               │                              │
  │  - Keep VTXO in Ark        │                              │
  │  - Redeem on-chain         │                              │
  │  - Spend via Lightning     │                              │
  │    (reverse swap)          │                              │
```

### Covenant Structure Per Entry

Each player's entry fee becomes an Ark VTXO with a Taproot script tree:

```
Taproot Internal Key: NUMS (unspendable)

Leaf 1 (Win):     <oracle_attestation_point> OP_CHECKSIG
                  <winner_pubkey> OP_CHECKSIGADD
                  2 OP_NUMEQUAL

Leaf 2 (Refund):  <timeout_blocks> OP_CSV OP_DROP
                  <player_pubkey> OP_CHECKSIG
```

- **Win path**: Oracle publishes `attestation_secret()` for the winning outcome. Winner uses their key + oracle attestation to claim the pooled VTXOs. Cryptographically enforced — the server can't withhold payment.
- **Refund path**: If the oracle goes silent or fails to attest, **each player can reclaim their full 500 sats** after the timelock expires. The server's 10% cut is only taken on successful settlement, not at swap time — so on refund, players are made completely whole.

### Why This Works Without a Registration Window

Traditional dlctix requires all N players to participate in MuSig2 signing rounds before the event starts. That's a UX killer for a drop-in arcade game.

With Ark covenants:
- The **ASP manages the VTXO tree** — no player-to-player coordination
- Each entry is an **independent VTXO** with its own covenant script
- The oracle attestation is a **public scalar** — anyone can verify it, and only the winner can use it to spend
- Players join throughout the day; each new entry just creates a new VTXO in the Ark tree
- At settlement, the oracle publishes one attestation, and the winner sweeps

The covenant replaces the multi-party MuSig2 ceremony. The Ark protocol replaces the on-chain transaction overhead.

### What We'd Need

| Component | Source | Status |
|-----------|--------|--------|
| Lightning → Ark swap | [ark-rs Boltz integration](https://github.com/arkade-os/rust-sdk) | Exists in Ark SDK |
| Oracle attestation (`attestation_secret`, locking points) | [dlctix](https://github.com/conduition/dlctix) | Exists, used in [noaa-oracle](https://github.com/ArcadeLabsInc/noaa-oracle) |
| Custom VTXO covenant scripts | Ark SDK `ark-core` (vHTLC / taproot builders) | Partial — vHTLC exists, would need adaptation for DLC-style scripts |
| MuSig2 coordination (if needed for ASP settlement rounds) | [KeyMeld](https://github.com/ArcadeLabsInc/keymeld) | Exists — async distributed MuSig2 with enclave isolation |
| Game server as oracle | This repo | Server already determines winners; just needs to produce attestation scalars |

### Open Questions

- **Can Ark VTXOs carry arbitrary covenant scripts?** The vHTLC implementation in ark-core suggests yes, but the spending paths would need to be adapted from hash-locks to DLC attestation-locks.
- **How does the ASP handle settlement rounds with covenant VTXOs?** Standard Ark settlement (rounds every ~few seconds) may need modification to support custom tapscript leaves.
- **Pool aggregation**: Individual entry VTXOs need to be aggregated into a single pool output for the winner. This could happen cooperatively (server aggregates) or via an Ark round.
- **Outcome encoding**: With a single daily winner, the outcome space is just N (one per player). The oracle commits locking points for all N outcomes at game start, which means the set of eligible players must be finalized at some cutoff — but players can still *join* up until that cutoff without coordinating with each other.
