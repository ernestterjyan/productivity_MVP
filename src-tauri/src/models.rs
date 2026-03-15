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
    #[serde(rename = "DESK_WORK", alias = "WRITING")]
    pub desk_work: i64,
    #[serde(rename = "AWAY")]
    pub away: i64,
    #[serde(rename = "UNCERTAIN")]
    pub uncertain: i64,
}

impl StateTotals {
    pub fn empty() -> Self {
        Self {
            on_screen: 0,
            desk_work: 0,
            away: 0,
            uncertain: 0,
        }
    }

    pub fn tracked_ms(&self) -> i64 {
        self.on_screen + self.desk_work + self.away + self.uncertain
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalibrationProfile {
    pub calibrated_at: String,
    pub screen_facing_baseline: f64,
    pub recommended_screen_facing_threshold: f64,
    pub desk_work_head_down_baseline: f64,
    pub recommended_head_down_threshold: f64,
    pub desk_work_screen_facing_upper_bound: f64,
    pub away_loss_delay_ms: i64,
    pub recommended_away_timeout_ms: i64,
    pub screen_sample_count: i64,
    pub desk_work_sample_count: i64,
    pub away_sample_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct AppSettings {
    pub webcam_preview_enabled: bool,
    pub debug_mode_enabled: bool,
    pub away_timeout_ms: i64,
    pub screen_facing_threshold: f64,
    pub face_away_threshold: f64,
    #[serde(alias = "writingSensitivity")]
    pub desk_work_sensitivity: i64,
    #[serde(alias = "writingSustainMs")]
    pub desk_work_sustain_ms: i64,
    pub transition_cooldown_ms: i64,
    pub retention_enabled: bool,
    pub retention_days: i64,
    pub start_tracking_on_open: bool,
    pub calibration_profile: Option<CalibrationProfile>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            webcam_preview_enabled: true,
            debug_mode_enabled: false,
            away_timeout_ms: 6000,
            screen_facing_threshold: 0.62,
            face_away_threshold: 0.3,
            desk_work_sensitivity: 62,
            desk_work_sustain_ms: 2800,
            transition_cooldown_ms: 1200,
            retention_enabled: false,
            retention_days: 30,
            start_tracking_on_open: false,
            calibration_profile: None,
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
    pub recoverable_session: Option<RecoverableSession>,
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
    pub source: String,
    pub manual_note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCompletionInput {
    pub session_id: String,
    pub ended_at: String,
    pub elapsed_ms: i64,
    pub totals: StateTotals,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCorrectionInput {
    pub session_id: String,
    pub state: String,
    pub note: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoverableSession {
    pub session: SessionSeed,
    pub segments: Vec<PersistedSegmentInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportBundle {
    pub exported_at: String,
    pub settings: AppSettings,
    pub sessions: Vec<SessionRecord>,
    pub state_segments: Vec<PersistedSegmentInput>,
    pub daily_summaries: Vec<DailySummary>,
}

pub fn empty_daily_summary(date: String) -> DailySummary {
    DailySummary {
        date,
        tracked_ms: 0,
        totals: StateTotals::empty(),
    }
}
