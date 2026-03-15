use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SessionRecordStatus {
    Active,
    Completed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateTotals {
    #[serde(rename = "ON_SCREEN")]
    pub on_screen: i64,
    #[serde(rename = "WRITING")]
    pub writing: i64,
    #[serde(rename = "AWAY")]
    pub away: i64,
    #[serde(rename = "UNCERTAIN")]
    pub uncertain: i64,
}

impl StateTotals {
    pub fn empty() -> Self {
        Self {
            on_screen: 0,
            writing: 0,
            away: 0,
            uncertain: 0,
        }
    }

    pub fn tracked_ms(&self) -> i64 {
        self.on_screen + self.writing + self.away + self.uncertain
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub webcam_preview_enabled: bool,
    pub debug_mode_enabled: bool,
    pub away_timeout_ms: i64,
    pub screen_facing_threshold: f64,
    pub face_away_threshold: f64,
    pub writing_sensitivity: i64,
    pub writing_sustain_ms: i64,
    pub transition_cooldown_ms: i64,
    pub retention_enabled: bool,
    pub retention_days: i64,
    pub start_tracking_on_open: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            webcam_preview_enabled: true,
            debug_mode_enabled: false,
            away_timeout_ms: 6000,
            screen_facing_threshold: 0.62,
            face_away_threshold: 0.3,
            writing_sensitivity: 62,
            writing_sustain_ms: 2800,
            transition_cooldown_ms: 1200,
            retention_enabled: false,
            retention_days: 30,
            start_tracking_on_open: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DailySummary {
    pub date: String,
    pub tracked_ms: i64,
    pub totals: StateTotals,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub elapsed_ms: i64,
    pub totals: StateTotals,
    pub status: SessionRecordStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapPayload {
    pub settings: AppSettings,
    pub today_summary: DailySummary,
    pub daily_history: Vec<DailySummary>,
    pub recent_sessions: Vec<SessionRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSeed {
    pub id: String,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersistedSegmentInput {
    pub id: String,
    pub session_id: String,
    pub state: String,
    pub started_at: String,
    pub ended_at: String,
    pub duration_ms: i64,
    pub confidence: f64,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCompletionInput {
    pub session_id: String,
    pub ended_at: String,
    pub elapsed_ms: i64,
    pub totals: StateTotals,
}

pub fn empty_daily_summary(date: String) -> DailySummary {
    DailySummary {
        date,
        tracked_ms: 0,
        totals: StateTotals::empty(),
    }
}
