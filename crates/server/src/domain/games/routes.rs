use axum::{
    extract::{Query, State},
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use time::OffsetDateTime;

use crate::{map_error, nostr_extractor::NostrAuth, startup::AppState};

use super::store::GameConfigResponse;

#[derive(Debug, Deserialize)]
pub struct ConfigQuery {
    pub session_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct NewSessionResponse {
    pub config: GameConfigResponse,
}

#[derive(Debug, Deserialize)]
pub struct ScoreSubmission {
    pub score: i64,
    pub level: i64,
    pub play_time: i64,
    pub session_id: String,
}

#[derive(Debug, Serialize)]
pub struct ScoreResponse {
    pub id: i64,
    pub score: i64,
    pub level: i64,
    pub play_time: i64,
    pub created_at: String,
}

// Health check endpoint
pub async fn health() -> impl IntoResponse {
    "OK"
}

// Create a new game session or get config for existing session
pub async fn get_game_config(
    auth: NostrAuth,
    Query(query): Query<ConfigQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, Response> {
    let pubkey = auth.pubkey.to_string();
    info!("Game config request from pubkey: {}", pubkey);

    // Find or create user
    let user = match state.user_store.find_by_pubkey(pubkey.clone()).await {
        Ok(Some(user)) => user,
        Ok(None) => {
            return Err((StatusCode::NOT_FOUND, "User not found").into_response());
        }
        Err(e) => return Err(map_error(e)),
    };

    // Use existing session or create new one
    if let Some(session_id) = query.session_id {
        // Update existing session
        match state.game_store.update_session_activity(&session_id).await {
            Ok(session) => {
                if session.user_id != user.id {
                    return Err(
                        (StatusCode::FORBIDDEN, "Session belongs to a different user")
                            .into_response(),
                    );
                }

                // Get config for this session
                match state.game_store.create_game_config(&session).await {
                    Ok(config) => Ok((StatusCode::OK, Json(config))),
                    Err(e) => Err(map_error(e)),
                }
            }
            Err(e) => Err(map_error(e)),
        }
    } else {
        // Create a new session
        match state.game_store.create_session(user.id).await {
            Ok(session) => match state.game_store.create_game_config(&session).await {
                Ok(config) => Ok((StatusCode::OK, Json(config))),
                Err(e) => Err(map_error(e)),
            },
            Err(e) => Err(map_error(e)),
        }
    }
}

// Create a new game session
pub async fn start_new_session(
    auth: NostrAuth,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, Response> {
    let pubkey = auth.pubkey.to_string();
    info!("New session request from pubkey: {}", pubkey);

    // Find user
    let user = match state.user_store.find_by_pubkey(pubkey.clone()).await {
        Ok(Some(user)) => user,
        Ok(None) => return Err((StatusCode::UNAUTHORIZED, "User not found").into_response()),
        Err(e) => return Err(map_error(e)),
    };

    // Check if the user has a valid payment within the last hour
    let has_valid_payment = match state.payment_store.has_valid_payment(user.id).await {
        Ok(valid) => valid,
        Err(e) => return Err(map_error(e)),
    };

    if has_valid_payment {
        // User has a valid payment, create a new session
        match state.game_store.create_session(user.id).await {
            Ok(session) => match state.game_store.create_game_config(&session).await {
                Ok(config) => {
                    return Ok((StatusCode::CREATED, Json(NewSessionResponse { config })))
                }
                Err(e) => return Err(map_error(e)),
            },
            Err(e) => return Err(map_error(e)),
        }
    }

    // Check if user has a pending payment
    let pending_payment = match state
        .payment_store
        .get_pending_payment_for_user(user.id)
        .await
    {
        Ok(Some(payment)) => payment,
        Ok(None) => {
            // No pending payment, create a new invoice via the unified provider
            return create_and_return_invoice(&state, user.id, &pubkey).await;
        }
        Err(e) => return Err(map_error(e)),
    };

    // Check payment status for existing pending payment
    info!(
        "Checking status of existing payment: {}",
        pending_payment.payment_id
    );

    let status_result = state
        .lightning_provider
        .check_payment_status(&pending_payment.payment_id)
        .await;

    match status_result {
        Ok(result) => match result.status.as_str() {
            "paid" => {
                info!(
                    "Payment {} is paid, updating status",
                    pending_payment.payment_id
                );

                if let Err(e) = state
                    .payment_store
                    .update_payment_status(&pending_payment.payment_id, "paid")
                    .await
                {
                    error!("Failed to update payment status: {}", e);
                }

                // Create a new session
                match state.game_store.create_session(user.id).await {
                    Ok(session) => match state.game_store.create_game_config(&session).await {
                        Ok(config) => {
                            Ok((StatusCode::CREATED, Json(NewSessionResponse { config })))
                        }
                        Err(e) => Err(map_error(e)),
                    },
                    Err(e) => Err(map_error(e)),
                }
            }
            "failed" => {
                info!(
                    "Payment {} has failed, creating new invoice",
                    pending_payment.payment_id
                );

                if let Err(e) = state
                    .payment_store
                    .update_payment_status(&pending_payment.payment_id, "failed")
                    .await
                {
                    error!("Failed to update payment status: {}", e);
                }

                create_and_return_invoice(&state, user.id, &pubkey).await
            }
            _ => {
                info!("Payment {} is still pending", pending_payment.payment_id);

                Err((
                    StatusCode::PAYMENT_REQUIRED,
                    Json(json!({
                        "payment_required": true,
                        "invoice": pending_payment.invoice,
                        "payment_id": pending_payment.payment_id,
                        "amount_sats": pending_payment.amount_sats,
                        "created_at": pending_payment.created_at
                    })),
                )
                    .into_response())
            }
        },
        Err(e) => {
            error!("Failed to check payment status: {}", e);

            Err((
                StatusCode::PAYMENT_REQUIRED,
                Json(json!({
                    "payment_required": true,
                    "invoice": pending_payment.invoice,
                    "payment_id": pending_payment.payment_id,
                    "amount_sats": pending_payment.amount_sats,
                    "created_at": pending_payment.created_at,
                    "error": "Could not verify payment status. Please try again."
                })),
            )
                .into_response())
        }
    }
}

/// Helper: create a Lightning invoice and return a 402 Payment Required response.
async fn create_and_return_invoice(
    state: &Arc<AppState>,
    user_id: i64,
    pubkey: &str,
) -> Result<(StatusCode, Json<NewSessionResponse>), Response> {
    let description = format!("Asteroids Game Entry Fee - User:{}", pubkey);

    let invoice_result = state
        .lightning_provider
        .create_invoice(500, &description)
        .await
        .map_err(|e| {
            error!("Failed to create invoice: {}", e);
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Failed to create payment invoice",
            )
                .into_response()
        })?;

    // For LND the invoice is returned immediately; for Voltage it needs polling
    let invoice_str = match invoice_result.invoice {
        Some(inv) => inv,
        None => {
            // Voltage path: poll for the invoice
            let mut invoice = None;
            for attempt in 0..10 {
                info!("Poll attempt {} for invoice", attempt + 1);
                match state
                    .lightning_provider
                    .check_payment_status(&invoice_result.payment_id)
                    .await
                {
                    Ok(status) if status.invoice.is_some() => {
                        invoice = status.invoice;
                        break;
                    }
                    _ => {
                        tokio::time::sleep(std::time::Duration::from_millis(2000)).await;
                    }
                }
            }
            invoice.ok_or_else(|| {
                error!("Failed to get invoice after polling");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Failed to generate Lightning invoice. Please try again.",
                )
                    .into_response()
            })?
        }
    };

    info!("Successfully obtained invoice: {}", invoice_str);

    let payment = state
        .payment_store
        .create_game_payment(user_id, &invoice_result.payment_id, &invoice_str, 500)
        .await
        .map_err(map_error)?;

    Err((
        StatusCode::PAYMENT_REQUIRED,
        Json(json!({
            "payment_required": true,
            "invoice": payment.invoice,
            "payment_id": payment.payment_id,
            "amount_sats": payment.amount_sats,
            "created_at": payment.created_at
        })),
    )
        .into_response())
}

// Submit a score
pub async fn submit_score(
    auth: NostrAuth,
    State(state): State<Arc<AppState>>,
    Json(submission): Json<ScoreSubmission>,
) -> Result<impl IntoResponse, Response> {
    let pubkey = auth.pubkey.to_string();
    info!("Score submission from pubkey: {}", pubkey);

    // Find user
    let user = match state.user_store.find_by_pubkey(pubkey).await {
        Ok(Some(user)) => user,
        Ok(None) => return Err((StatusCode::UNAUTHORIZED, "User not found").into_response()),
        Err(e) => return Err(map_error(e)),
    };

    // Debug log the session ID we're looking for
    info!("Looking for session ID: {}", submission.session_id);

    // Verify session
    match state.game_store.find_session(&submission.session_id).await {
        Ok(Some(session)) => {
            if session.user_id != user.id {
                return Err(
                    (StatusCode::FORBIDDEN, "Session belongs to a different user").into_response(),
                );
            }

            // Submit the score
            match state
                .game_store
                .submit_score(
                    user.id,
                    submission.score,
                    submission.level,
                    submission.play_time,
                )
                .await
            {
                Ok(score) => {
                    // Publish verified score to audit ledger
                    if let Err(e) = state
                        .ledger_service
                        .publish_score_verified(
                            &user.nostr_pubkey,
                            &submission.session_id,
                            "", // seed - will be populated when replay verification is implemented
                            submission.score,
                            submission.level,
                            0, // frames - will be populated when replay verification is implemented
                            "", // input_hash - will be populated when replay verification is implemented
                            &OffsetDateTime::now_utc().date().to_string(),
                        )
                        .await
                    {
                        warn!("Failed to publish score verification to ledger: {}", e);
                    }

                    let response = ScoreResponse {
                        id: score.id,
                        score: score.score,
                        level: score.level,
                        play_time: score.play_time,
                        created_at: score.created_at,
                    };
                    Ok((StatusCode::CREATED, Json(response)))
                }
                Err(e) => Err(map_error(e)),
            }
        }
        Ok(None) => {
            info!("Session not found: {}", submission.session_id);
            Err((StatusCode::NOT_FOUND, "Session not found").into_response())
        }
        Err(e) => Err(map_error(e)),
    }
}

// Get top scores
pub async fn get_top_scores(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, Response> {
    info!("Get top scores request");

    match state.game_store.get_top_scores(10).await {
        Ok(scores) => Ok((StatusCode::OK, Json(scores))),
        Err(e) => Err(map_error(e)),
    }
}

// Get user scores
pub async fn get_user_scores(
    auth: NostrAuth,
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, Response> {
    let pubkey = auth.pubkey.to_string();
    info!("Get user scores request from pubkey: {}", pubkey);

    // Find user
    let user = match state.user_store.find_by_pubkey(pubkey).await {
        Ok(Some(user)) => user,
        Ok(None) => return Err((StatusCode::UNAUTHORIZED, "User not found").into_response()),
        Err(e) => return Err(map_error(e)),
    };

    // Get scores
    match state.game_store.get_user_scores(user.id, 10).await {
        Ok(scores) => {
            let response: Vec<ScoreResponse> = scores
                .into_iter()
                .map(|score| ScoreResponse {
                    id: score.id,
                    score: score.score,
                    level: score.level,
                    play_time: score.play_time,
                    created_at: score.created_at,
                })
                .collect();

            Ok((StatusCode::OK, Json(response)))
        }
        Err(e) => Err(map_error(e)),
    }
}
