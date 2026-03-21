use maud::{html, Markup};

pub fn navbar() -> Markup {
    html! {
        div class="nav-bar" {
            div class="nav-bar-left" {
                a href="/leaderboard"
                  class="nes-btn is-primary"
                  hx-get="/leaderboard"
                  hx-target="#main-content"
                  hx-push-url="true" {
                    "Leaderboard"
                }
            }

            div class="auth-container" {
                div id="authButtons" {
                    button class="nes-btn is-primary" id="loginBtn" {
                        "Login"
                    }
                    button class="nes-btn is-success" id="registerBtn" {
                        "Sign Up"
                    }
                }
                div id="userInfoArea" class="is-hidden" {
                    span id="usernameDisplay" class="nes-text is-primary" {}
                    button class="nes-btn is-error" id="logoutBtn" {
                        "Logout"
                    }
                }
            }
        }
    }
}
