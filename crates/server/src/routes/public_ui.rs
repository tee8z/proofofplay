use std::sync::Arc;

use axum::{extract::State, response::Html};

use crate::startup::AppState;
use crate::templates::layouts::base::{base, PageConfig};

pub async fn index_handler(State(state): State<Arc<AppState>>) -> Html<String> {
    let config = PageConfig {
        title: "Not Found - Proof of Play",
        api_base: &state.remote_url,
    };
    let content = maud::html! {
        div class="nes-container is-dark" style="text-align: center; margin-top: 40px;" {
            h1 class="nes-text is-error" { "404" }
            p { "Page not found." }
            a href="/" class="nes-btn is-primary" { "Go Home" }
        }
    };
    Html(base(&config, content).into_string())
}
