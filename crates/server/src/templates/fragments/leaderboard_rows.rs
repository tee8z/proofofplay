use maud::{html, Markup};

use crate::domain::ScoreWithUsername;

pub fn leaderboard_rows(scores: &[ScoreWithUsername]) -> Markup {
    html! {
        @if scores.is_empty() {
            tr {
                td colspan="7" class="has-text-centered" {
                    "No scores available yet!"
                }
            }
        } @else {
            @for (index, score) in scores.iter().enumerate() {
                @let is_banned = score.banned != 0;
                tr style=@if is_banned { "opacity: 0.4; text-decoration: line-through;" }  {
                    td class="has-text-centered" { (index + 1) }
                    td class="has-text-centered nes-text is-primary" {
                        (&score.username)
                        @if is_banned {
                            span class="nes-text is-error" style="font-size: 0.7em; margin-left: 4px;" title="Banned" { "[X]" }
                        }
                    }
                    td class="has-text-centered nes-text is-success" { (score.score) }
                    td class="has-text-centered" { (score.level) }
                    td class="has-text-centered" { (format_play_time(score.play_time)) }
                    td class="has-text-centered" { (format_date(&score.created_at)) }
                    td class="has-text-centered" {
                        button class="nes-btn is-primary replay-btn"
                               data-score-id=(score.id)
                               style="font-size: 0.6em; padding: 2px 6px;" { "Watch" }
                    }
                }
            }
        }
    }
}

/// Truncate "2026-03-21 21:05:52.645198456 +00:00:00" → "Mar 21 21:05"
fn format_date(raw: &str) -> String {
    let months = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    // Try to parse YYYY-MM-DD HH:MM
    if raw.len() >= 16 {
        let month: usize = raw[5..7].parse().unwrap_or(1);
        let day = &raw[8..10];
        let time = &raw[11..16]; // HH:MM
        let month_name = months.get(month.wrapping_sub(1)).unwrap_or(&"???");
        return format!("{} {} {}", month_name, day, time);
    }
    raw.chars().take(16).collect()
}

fn format_play_time(seconds: i64) -> String {
    let minutes = seconds / 60;
    let secs = seconds % 60;
    format!("{}m:{:02}s", minutes, secs)
}
