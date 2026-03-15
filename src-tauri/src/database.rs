use std::collections::{BTreeMap, HashSet};
use std::path::Path;

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Local, LocalResult, NaiveDateTime, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use crate::models::{
    empty_daily_summary, AppSettings, BootstrapPayload, DailySummary, ExportBundle,
    PersistedSegmentInput, RecoverableSession, SessionCompletionInput, SessionCorrectionInput,
    SessionRecord, SessionRecordStatus, SessionSeed, StateTotals,
};

pub struct Database {
    connection: Connection,
}

impl Database {
    pub fn new(path: &Path) -> Result<Self> {
        let connection = Connection::open(path)
            .with_context(|| format!("failed to open sqlite database at {}", path.display()))?;
        connection.execute_batch("PRAGMA foreign_keys = ON;")?;

        let database = Self { connection };
        database.migrate()?;
        database.seed_defaults()?;
        Ok(database)
    }

    pub fn bootstrap(&mut self) -> Result<BootstrapPayload> {
        let recoverable_session_id = self.retain_latest_active_session()?;
        let settings = self.read_settings()?;

        if settings.retention_enabled {
            self.prune_old_data(settings.retention_days)?;
            self.rebuild_daily_summaries()?;
        }

        let today_key = today_key();
        let daily_history = self.read_daily_summaries()?;
        let today_summary = daily_history
            .iter()
            .find(|summary| summary.date == today_key)
            .cloned()
            .unwrap_or_else(|| empty_daily_summary(today_key.clone()));

        Ok(BootstrapPayload {
            settings,
            today_summary,
            daily_history: if daily_history.is_empty() {
                vec![empty_daily_summary(today_key)]
            } else {
                daily_history
            },
            recent_sessions: self.read_recent_sessions()?,
            recoverable_session: self.read_recoverable_session(recoverable_session_id.as_deref())?,
        })
    }

    pub fn create_session(&mut self, started_at: String) -> Result<SessionSeed> {
        self.clear_active_sessions()?;
        let session_id = Uuid::new_v4().to_string();
        self.connection.execute(
            r#"
            INSERT INTO sessions (
              id,
              started_at,
              status,
              elapsed_ms,
              on_screen_ms,
              writing_ms,
              away_ms,
              uncertain_ms,
              created_at
            ) VALUES (?1, ?2, 'ACTIVE', 0, 0, 0, 0, 0, ?3)
            "#,
            params![session_id, started_at, now_iso()],
        )?;

        Ok(SessionSeed {
            id: session_id,
            started_at,
        })
    }

    pub fn append_state_segment(&mut self, segment: PersistedSegmentInput) -> Result<()> {
        self.connection.execute(
            r#"
            INSERT OR REPLACE INTO state_segments (
              id,
              session_id,
              state,
              started_at,
              ended_at,
              duration_ms,
              confidence,
              reason,
              source,
              manual_note,
              created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                segment.id,
                segment.session_id,
                normalize_state_name(&segment.state),
                segment.started_at,
                segment.ended_at,
                segment.duration_ms,
                segment.confidence,
                segment.reason,
                segment.source,
                segment.manual_note,
                now_iso(),
            ],
        )?;

        Ok(())
    }

    pub fn finish_session(&mut self, payload: SessionCompletionInput) -> Result<BootstrapPayload> {
        self.connection.execute(
            r#"
            UPDATE sessions
            SET ended_at = ?1,
                status = 'COMPLETED',
                elapsed_ms = ?2,
                on_screen_ms = ?3,
                writing_ms = ?4,
                away_ms = ?5,
                uncertain_ms = ?6
            WHERE id = ?7
            "#,
            params![
                payload.ended_at,
                payload.elapsed_ms,
                payload.totals.on_screen,
                payload.totals.desk_work,
                payload.totals.away,
                payload.totals.uncertain,
                payload.session_id,
            ],
        )?;
        self.rebuild_daily_summaries()?;
        self.bootstrap()
    }

    pub fn correct_session(&mut self, payload: SessionCorrectionInput) -> Result<BootstrapPayload> {
        let SessionCorrectionInput {
            session_id,
            state,
            note,
        } = payload;
        let session = self.connection.query_row(
            r#"
            SELECT started_at, ended_at, elapsed_ms, status
            FROM sessions
            WHERE id = ?1
            "#,
            params![session_id.clone()],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )?;

        let (started_at, ended_at, elapsed_ms, status) = session;
        let safe_elapsed_ms = std::cmp::max(0, elapsed_ms);

        if status != "COMPLETED" {
            anyhow::bail!("Only completed sessions can be corrected.");
        }

        let ended_at = ended_at.context("completed session is missing an end timestamp")?;
        let mut corrected_totals = StateTotals::empty();
        add_state_duration(&mut corrected_totals, &state, safe_elapsed_ms);

        self.connection.execute(
            r#"
            UPDATE sessions
            SET on_screen_ms = ?1,
                writing_ms = ?2,
                away_ms = ?3,
                uncertain_ms = ?4,
                elapsed_ms = ?5
            WHERE id = ?6
            "#,
            params![
                corrected_totals.on_screen,
                corrected_totals.desk_work,
                corrected_totals.away,
                corrected_totals.uncertain,
                safe_elapsed_ms,
                session_id.clone(),
            ],
        )?;

        self.connection.execute(
            "DELETE FROM state_segments WHERE session_id = ?1",
            params![session_id.clone()],
        )?;
        self.connection.execute(
            r#"
            INSERT INTO state_segments (
              id,
              session_id,
              state,
              started_at,
              ended_at,
              duration_ms,
              confidence,
              reason,
              source,
              manual_note,
              created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'MANUAL', ?9, ?10)
            "#,
            params![
                Uuid::new_v4().to_string(),
                session_id,
                normalize_state_name(&state),
                started_at,
                ended_at,
                safe_elapsed_ms,
                1.0,
                note.clone(),
                note,
                now_iso(),
            ],
        )?;

        self.rebuild_daily_summaries()?;
        self.bootstrap()
    }

    pub fn export_data(&mut self) -> Result<ExportBundle> {
        let settings = self.read_settings()?;

        if settings.retention_enabled {
            self.prune_old_data(settings.retention_days)?;
            self.rebuild_daily_summaries()?;
        }

        Ok(ExportBundle {
            exported_at: now_iso(),
            settings,
            sessions: self.read_all_sessions()?,
            state_segments: self.read_all_segments()?,
            daily_summaries: self.read_daily_summaries()?,
        })
    }

    pub fn delete_session(&mut self, session_id: String) -> Result<BootstrapPayload> {
        self.connection.execute(
            "DELETE FROM state_segments WHERE session_id = ?1",
            params![session_id],
        )?;
        self.connection
            .execute("DELETE FROM sessions WHERE id = ?1", params![session_id])?;
        self.rebuild_daily_summaries()?;
        self.bootstrap()
    }

    pub fn save_settings(&mut self, settings: AppSettings) -> Result<BootstrapPayload> {
        let raw = serde_json::to_string(&settings)?;
        self.connection.execute(
            r#"
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('app_settings', ?1, ?2)
            ON CONFLICT(key) DO UPDATE SET
              value = excluded.value,
              updated_at = excluded.updated_at
            "#,
            params![raw, now_iso()],
        )?;

        if settings.retention_enabled {
            self.prune_old_data(settings.retention_days)?;
        }

        self.rebuild_daily_summaries()?;
        self.bootstrap()
    }

    fn migrate(&self) -> Result<()> {
        self.connection.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS sessions (
              id TEXT PRIMARY KEY,
              started_at TEXT NOT NULL,
              ended_at TEXT,
              status TEXT NOT NULL,
              elapsed_ms INTEGER NOT NULL DEFAULT 0,
              on_screen_ms INTEGER NOT NULL DEFAULT 0,
              writing_ms INTEGER NOT NULL DEFAULT 0,
              away_ms INTEGER NOT NULL DEFAULT 0,
              uncertain_ms INTEGER NOT NULL DEFAULT 0,
              created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS state_segments (
              id TEXT PRIMARY KEY,
              session_id TEXT NOT NULL,
              state TEXT NOT NULL,
              started_at TEXT NOT NULL,
              ended_at TEXT NOT NULL,
              duration_ms INTEGER NOT NULL,
              confidence REAL NOT NULL,
              reason TEXT NOT NULL,
              source TEXT NOT NULL DEFAULT 'INFERENCE',
              manual_note TEXT,
              created_at TEXT NOT NULL,
              FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS daily_summaries (
              date TEXT PRIMARY KEY,
              tracked_ms INTEGER NOT NULL DEFAULT 0,
              on_screen_ms INTEGER NOT NULL DEFAULT 0,
              writing_ms INTEGER NOT NULL DEFAULT 0,
              away_ms INTEGER NOT NULL DEFAULT 0,
              uncertain_ms INTEGER NOT NULL DEFAULT 0,
              updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS app_settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS sessions_started_at_idx ON sessions(started_at DESC);
            CREATE INDEX IF NOT EXISTS segments_session_id_idx ON state_segments(session_id);
            "#,
        )?;
        self.ensure_column(
            "state_segments",
            "source",
            "TEXT NOT NULL DEFAULT 'INFERENCE'",
        )?;
        self.ensure_column("state_segments", "manual_note", "TEXT")?;

        Ok(())
    }

    fn seed_defaults(&self) -> Result<()> {
        self.connection.execute(
            r#"
            INSERT OR IGNORE INTO app_settings (key, value, updated_at)
            VALUES ('app_settings', ?1, ?2)
            "#,
            params![serde_json::to_string(&AppSettings::default())?, now_iso()],
        )?;

        Ok(())
    }

    fn clear_active_sessions(&mut self) -> Result<()> {
        self.connection.execute(
            "DELETE FROM state_segments WHERE session_id IN (SELECT id FROM sessions WHERE status = 'ACTIVE')",
            [],
        )?;
        self.connection
            .execute("DELETE FROM sessions WHERE status = 'ACTIVE'", [])?;
        Ok(())
    }

    fn retain_latest_active_session(&mut self) -> Result<Option<String>> {
        let latest_active_id: Option<String> = self
            .connection
            .query_row(
                r#"
                SELECT id
                FROM sessions
                WHERE status = 'ACTIVE'
                ORDER BY started_at DESC
                LIMIT 1
                "#,
                [],
                |row| row.get(0),
            )
            .optional()?;

        if let Some(session_id) = latest_active_id.clone() {
            self.connection.execute(
                "DELETE FROM state_segments WHERE session_id IN (SELECT id FROM sessions WHERE status = 'ACTIVE' AND id <> ?1)",
                params![session_id.clone()],
            )?;
            self.connection.execute(
                "DELETE FROM sessions WHERE status = 'ACTIVE' AND id <> ?1",
                params![session_id],
            )?;
        }

        Ok(latest_active_id)
    }

    fn read_settings(&self) -> Result<AppSettings> {
        let raw: String = self.connection.query_row(
            "SELECT value FROM app_settings WHERE key = 'app_settings'",
            [],
            |row| row.get(0),
        )?;

        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    fn read_recoverable_session(
        &self,
        recoverable_session_id: Option<&str>,
    ) -> Result<Option<RecoverableSession>> {
        let Some(session_id) = recoverable_session_id else {
            return Ok(None);
        };

        let started_at: String = self.connection.query_row(
            "SELECT started_at FROM sessions WHERE id = ?1 AND status = 'ACTIVE'",
            params![session_id],
            |row| row.get(0),
        )?;
        let mut statement = self.connection.prepare(
            r#"
            SELECT
              id,
              session_id,
              state,
              started_at,
              ended_at,
              duration_ms,
              confidence,
              reason,
              source,
              manual_note
            FROM state_segments
            WHERE session_id = ?1
            ORDER BY started_at ASC
            "#,
        )?;
        let rows = statement.query_map(params![session_id], |row| {
            let raw_state: String = row.get(2)?;
            Ok(PersistedSegmentInput {
                id: row.get(0)?,
                session_id: row.get(1)?,
                state: normalize_state_name(&raw_state),
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                duration_ms: row.get(5)?,
                confidence: row.get(6)?,
                reason: row.get(7)?,
                source: row.get(8)?,
                manual_note: row.get(9)?,
            })
        })?;
        let segments = rows.collect::<rusqlite::Result<Vec<_>>>()?;

        Ok(Some(RecoverableSession {
            session: SessionSeed {
                id: session_id.to_string(),
                started_at,
            },
            segments,
        }))
    }

    fn read_recent_sessions(&self) -> Result<Vec<SessionRecord>> {
        self.read_sessions("LIMIT 12")
    }

    fn read_all_sessions(&self) -> Result<Vec<SessionRecord>> {
        self.read_sessions("")
    }

    fn read_sessions(&self, limit_clause: &str) -> Result<Vec<SessionRecord>> {
        let mut statement = self.connection.prepare(&format!(
            r#"
            SELECT
              id,
              started_at,
              ended_at,
              elapsed_ms,
              on_screen_ms,
              writing_ms,
              away_ms,
              uncertain_ms,
              status
            FROM sessions
            WHERE status = 'COMPLETED'
            ORDER BY started_at DESC
            {}
            "#,
            limit_clause
        ))?;

        let rows = statement.query_map([], |row| {
            let status: String = row.get(8)?;
            Ok(SessionRecord {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                elapsed_ms: row.get(3)?,
                totals: StateTotals {
                    on_screen: row.get(4)?,
                    desk_work: row.get(5)?,
                    away: row.get(6)?,
                    uncertain: row.get(7)?,
                },
                status: if status == "ACTIVE" {
                    SessionRecordStatus::Active
                } else {
                    SessionRecordStatus::Completed
                },
            })
        })?;

        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    fn read_all_segments(&self) -> Result<Vec<PersistedSegmentInput>> {
        let mut statement = self.connection.prepare(
            r#"
            SELECT
              id,
              session_id,
              state,
              started_at,
              ended_at,
              duration_ms,
              confidence,
              reason,
              source,
              manual_note
            FROM state_segments
            ORDER BY started_at ASC
            "#,
        )?;

        let rows = statement.query_map([], |row| {
            let raw_state: String = row.get(2)?;
            Ok(PersistedSegmentInput {
                id: row.get(0)?,
                session_id: row.get(1)?,
                state: normalize_state_name(&raw_state),
                started_at: row.get(3)?,
                ended_at: row.get(4)?,
                duration_ms: row.get(5)?,
                confidence: row.get(6)?,
                reason: row.get(7)?,
                source: row.get(8)?,
                manual_note: row.get(9)?,
            })
        })?;

        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    fn read_daily_summaries(&self) -> Result<Vec<DailySummary>> {
        let mut statement = self.connection.prepare(
            r#"
            SELECT date, tracked_ms, on_screen_ms, writing_ms, away_ms, uncertain_ms
            FROM daily_summaries
            ORDER BY date DESC
            LIMIT 14
            "#,
        )?;

        let rows = statement.query_map([], |row| {
            Ok(DailySummary {
                date: row.get(0)?,
                tracked_ms: row.get(1)?,
                totals: StateTotals {
                    on_screen: row.get(2)?,
                    desk_work: row.get(3)?,
                    away: row.get(4)?,
                    uncertain: row.get(5)?,
                },
            })
        })?;

        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    fn rebuild_daily_summaries(&mut self) -> Result<()> {
        self.connection.execute("DELETE FROM daily_summaries", [])?;

        let mut segment_statement = self.connection.prepare(
            r#"
            SELECT
              state_segments.session_id,
              state_segments.state,
              state_segments.started_at,
              state_segments.ended_at,
              state_segments.duration_ms
            FROM state_segments
            INNER JOIN sessions ON sessions.id = state_segments.session_id
            WHERE sessions.status = 'COMPLETED'
            ORDER BY state_segments.started_at ASC
            "#,
        )?;

        let segment_rows = segment_statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })?;

        let mut buckets: BTreeMap<String, StateTotals> = BTreeMap::new();
        let mut sessions_with_segments = HashSet::<String>::new();

        for row in segment_rows {
            let (session_id, state, started_at, ended_at, duration_ms) = row?;
            sessions_with_segments.insert(session_id);

            for (date, split_duration_ms) in
                split_segment_by_local_day(&started_at, &ended_at, duration_ms)
            {
                let entry = buckets.entry(date).or_insert_with(StateTotals::empty);
                add_state_duration(entry, &state, split_duration_ms);
            }
        }

        // Legacy fallback for sessions that have totals but no segment rows.
        let mut session_statement = self.connection.prepare(
            r#"
            SELECT id, started_at, on_screen_ms, writing_ms, away_ms, uncertain_ms
            FROM sessions
            WHERE status = 'COMPLETED'
            "#,
        )?;
        let session_rows = session_statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                StateTotals {
                    on_screen: row.get(2)?,
                    desk_work: row.get(3)?,
                    away: row.get(4)?,
                    uncertain: row.get(5)?,
                },
            ))
        })?;

        for row in session_rows {
            let (session_id, started_at, totals) = row?;

            if sessions_with_segments.contains(&session_id) {
                continue;
            }

            let date = date_key_for_iso(&started_at);
            let entry = buckets.entry(date).or_insert_with(StateTotals::empty);
            entry.on_screen += totals.on_screen;
            entry.desk_work += totals.desk_work;
            entry.away += totals.away;
            entry.uncertain += totals.uncertain;
        }

        for (date, totals) in buckets {
            self.connection.execute(
                r#"
                INSERT INTO daily_summaries (
                  date,
                  tracked_ms,
                  on_screen_ms,
                  writing_ms,
                  away_ms,
                  uncertain_ms,
                  updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                "#,
                params![
                    date,
                    totals.tracked_ms(),
                    totals.on_screen,
                    totals.desk_work,
                    totals.away,
                    totals.uncertain,
                    now_iso(),
                ],
            )?;
        }

        Ok(())
    }

    fn prune_old_data(&mut self, retention_days: i64) -> Result<()> {
        let cutoff = (Utc::now() - Duration::days(retention_days)).to_rfc3339();

        self.connection.execute(
            "DELETE FROM state_segments WHERE session_id IN (SELECT id FROM sessions WHERE status = 'COMPLETED' AND started_at < ?1)",
            params![cutoff.clone()],
        )?;
        self.connection.execute(
            "DELETE FROM sessions WHERE status = 'COMPLETED' AND started_at < ?1",
            params![cutoff],
        )?;
        Ok(())
    }

    fn ensure_column(&self, table: &str, column: &str, definition: &str) -> Result<()> {
        let mut statement = self
            .connection
            .prepare(&format!("PRAGMA table_info({})", table))?;
        let columns = statement.query_map([], |row| row.get::<_, String>(1))?;
        let exists = columns
            .collect::<rusqlite::Result<Vec<_>>>()?
            .into_iter()
            .any(|existing| existing == column);

        if !exists {
            self.connection.execute(
                &format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, definition),
                [],
            )?;
        }

        Ok(())
    }
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn today_key() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn date_key_for_iso(iso: &str) -> String {
    DateTime::parse_from_rfc3339(iso)
        .map(|date| date.with_timezone(&Local).format("%Y-%m-%d").to_string())
        .unwrap_or_else(|_| iso.chars().take(10).collect())
}

fn date_key_for_millis(timestamp_ms: i64) -> Option<String> {
    DateTime::<Utc>::from_timestamp_millis(timestamp_ms)
        .map(|date| date.with_timezone(&Local).format("%Y-%m-%d").to_string())
}

fn resolve_local_datetime(naive: NaiveDateTime) -> Option<DateTime<Local>> {
    match Local.from_local_datetime(&naive) {
        LocalResult::Single(date) => Some(date),
        LocalResult::Ambiguous(first, _) => Some(first),
        LocalResult::None => {
            let mut probe = naive;

            for _ in 0..6 {
                probe += Duration::hours(1);
                match Local.from_local_datetime(&probe) {
                    LocalResult::Single(date) => return Some(date),
                    LocalResult::Ambiguous(first, _) => return Some(first),
                    LocalResult::None => {}
                }
            }

            None
        }
    }
}

fn next_local_day_start_millis(timestamp_ms: i64) -> Option<i64> {
    let local = DateTime::<Utc>::from_timestamp_millis(timestamp_ms)?.with_timezone(&Local);
    let next_date = local.date_naive().succ_opt()?;
    let midnight = next_date.and_hms_opt(0, 0, 0)?;
    let resolved = resolve_local_datetime(midnight)?;
    Some(resolved.with_timezone(&Utc).timestamp_millis())
}

fn split_segment_by_local_day(
    started_at: &str,
    ended_at: &str,
    fallback_duration_ms: i64,
) -> Vec<(String, i64)> {
    let started = DateTime::parse_from_rfc3339(started_at);
    let ended = DateTime::parse_from_rfc3339(ended_at);

    let (started_ms, ended_ms) = match (started, ended) {
        (Ok(valid_start), Ok(valid_end))
            if valid_end.timestamp_millis() > valid_start.timestamp_millis() =>
        {
            (valid_start.timestamp_millis(), valid_end.timestamp_millis())
        }
        _ => {
            return vec![(
                date_key_for_iso(started_at),
                std::cmp::max(0, fallback_duration_ms),
            )]
        }
    };

    let mut slices: Vec<(String, i64)> = Vec::new();
    let mut cursor_ms = started_ms;

    while cursor_ms < ended_ms {
        let boundary_ms = next_local_day_start_millis(cursor_ms).unwrap_or(ended_ms);
        let slice_end_ms = std::cmp::min(ended_ms, boundary_ms);
        let duration_ms = std::cmp::max(0, slice_end_ms - cursor_ms);

        if duration_ms > 0 {
            let date = date_key_for_millis(cursor_ms)
                .unwrap_or_else(|| date_key_for_iso(started_at));
            slices.push((date, duration_ms));
        }

        if slice_end_ms <= cursor_ms {
            break;
        }

        cursor_ms = slice_end_ms;
    }

    if slices.is_empty() {
        vec![(
            date_key_for_iso(started_at),
            std::cmp::max(0, fallback_duration_ms),
        )]
    } else {
        slices
    }
}

fn add_state_duration(totals: &mut StateTotals, state: &str, duration_ms: i64) {
    let safe_duration = std::cmp::max(0, duration_ms);

    if safe_duration <= 0 {
        return;
    }

    match normalize_state_name(state).as_str() {
        "ON_SCREEN" => totals.on_screen += safe_duration,
        "DESK_WORK" => totals.desk_work += safe_duration,
        "AWAY" => totals.away += safe_duration,
        "UNCERTAIN" => totals.uncertain += safe_duration,
        _ => {}
    }
}

fn normalize_state_name(state: &str) -> String {
    if state == "WRITING" {
        "DESK_WORK".to_string()
    } else {
        state.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::{resolve_local_datetime, split_segment_by_local_day, Database};
    use crate::models::{PersistedSegmentInput, SessionCompletionInput, SessionCorrectionInput};
    use chrono::{Duration, Local};
    use std::path::PathBuf;
    use uuid::Uuid;

    fn make_database_path() -> PathBuf {
        std::env::temp_dir().join(format!("focus-estimate-test-{}.sqlite", Uuid::new_v4()))
    }

    fn make_database() -> Database {
        let path = make_database_path();
        Database::new(&path).expect("database should initialize")
    }

    #[test]
    fn splits_segment_across_two_local_days() {
        let date = Local::now().date_naive();
        let start_naive = date.and_hms_opt(23, 50, 0).expect("valid start");
        let end_naive = date
            .succ_opt()
            .expect("next day exists")
            .and_hms_opt(0, 10, 0)
            .expect("valid end");
        let started_at = resolve_local_datetime(start_naive)
            .expect("resolves to local datetime")
            .to_rfc3339();
        let ended_at = resolve_local_datetime(end_naive)
            .expect("resolves to local datetime")
            .to_rfc3339();

        let slices = split_segment_by_local_day(&started_at, &ended_at, 20 * 60 * 1000);

        assert_eq!(slices.len(), 2);
        assert_eq!(slices[0].1, 10 * 60 * 1000);
        assert_eq!(slices[1].1, 10 * 60 * 1000);
    }

    #[test]
    fn uses_fallback_when_timestamps_are_invalid() {
        let slices = split_segment_by_local_day("invalid", "invalid", 30_000);

        assert_eq!(slices.len(), 1);
        assert_eq!(slices[0].1, 30_000);
    }

    #[test]
    fn bootstrap_includes_recoverable_active_session() {
        let mut database = make_database();
        let started_at = Local::now().to_rfc3339();
        let seed = database
            .create_session(started_at.clone())
            .expect("session should be created");
        let ended_at = (Local::now() + Duration::minutes(1)).to_rfc3339();

        database
            .append_state_segment(PersistedSegmentInput {
                id: Uuid::new_v4().to_string(),
                session_id: seed.id.clone(),
                state: "UNCERTAIN".to_string(),
                started_at,
                ended_at,
                duration_ms: 60_000,
                confidence: 0.4,
                reason: "Recoverable test segment".to_string(),
                source: "INFERENCE".to_string(),
                manual_note: None,
            })
            .expect("segment should be stored");

        let payload = database.bootstrap().expect("bootstrap should succeed");

        assert!(payload.recoverable_session.is_some());
        assert_eq!(
            payload
                .recoverable_session
                .expect("recoverable payload present")
                .session
                .id,
            seed.id
        );
    }

    #[test]
    fn correction_rewrites_totals_and_segments() {
        let mut database = make_database();
        let started_at = Local::now().to_rfc3339();
        let ended_at = (Local::now() + Duration::minutes(20)).to_rfc3339();
        let seed = database
            .create_session(started_at.clone())
            .expect("session should be created");

        database
            .append_state_segment(PersistedSegmentInput {
                id: Uuid::new_v4().to_string(),
                session_id: seed.id.clone(),
                state: "ON_SCREEN".to_string(),
                started_at: started_at.clone(),
                ended_at: ended_at.clone(),
                duration_ms: 20 * 60 * 1000,
                confidence: 0.8,
                reason: "Original segment".to_string(),
                source: "INFERENCE".to_string(),
                manual_note: None,
            })
            .expect("segment should be stored");
        database
            .finish_session(SessionCompletionInput {
                session_id: seed.id.clone(),
                ended_at: ended_at.clone(),
                elapsed_ms: 20 * 60 * 1000,
                totals: crate::models::StateTotals {
                    on_screen: 20 * 60 * 1000,
                    desk_work: 0,
                    away: 0,
                    uncertain: 0,
                },
            })
            .expect("session should be completed");

        let corrected = database
            .correct_session(SessionCorrectionInput {
                session_id: seed.id.clone(),
                state: "DESK_WORK".to_string(),
                note: "Retrospective correction test.".to_string(),
            })
            .expect("correction should succeed");
        let corrected_session = corrected
            .recent_sessions
            .into_iter()
            .find(|session| session.id == seed.id)
            .expect("corrected session should exist");
        let export = database.export_data().expect("export should succeed");
        let corrected_segments: Vec<_> = export
            .state_segments
            .into_iter()
            .filter(|segment| segment.session_id == seed.id)
            .collect();

        assert_eq!(corrected_session.totals.desk_work, 20 * 60 * 1000);
        assert_eq!(corrected_session.totals.on_screen, 0);
        assert_eq!(corrected_segments.len(), 1);
        assert_eq!(corrected_segments[0].source, "MANUAL");
    }
}
