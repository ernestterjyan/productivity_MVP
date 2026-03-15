use std::collections::BTreeMap;
use std::path::Path;

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Local, Utc};
use rusqlite::{params, Connection};
use uuid::Uuid;

use crate::models::{
    empty_daily_summary, AppSettings, BootstrapPayload, DailySummary, PersistedSegmentInput,
    SessionCompletionInput, SessionRecord, SessionRecordStatus, SessionSeed, StateTotals,
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
        self.reconcile_incomplete_sessions()?;
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
        })
    }

    pub fn create_session(&mut self, started_at: String) -> Result<SessionSeed> {
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
              created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                segment.id,
                segment.session_id,
                segment.state,
                segment.started_at,
                segment.ended_at,
                segment.duration_ms,
                segment.confidence,
                segment.reason,
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
                payload.totals.writing,
                payload.totals.away,
                payload.totals.uncertain,
                payload.session_id,
            ],
        )?;
        self.rebuild_daily_summaries()?;
        self.bootstrap()
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

    fn reconcile_incomplete_sessions(&mut self) -> Result<()> {
        self.connection.execute(
            "DELETE FROM state_segments WHERE session_id IN (SELECT id FROM sessions WHERE status = 'ACTIVE')",
            [],
        )?;
        self.connection
            .execute("DELETE FROM sessions WHERE status = 'ACTIVE'", [])?;
        Ok(())
    }

    fn read_settings(&self) -> Result<AppSettings> {
        let raw: String = self.connection.query_row(
            "SELECT value FROM app_settings WHERE key = 'app_settings'",
            [],
            |row| row.get(0),
        )?;

        Ok(serde_json::from_str(&raw).unwrap_or_default())
    }

    fn read_recent_sessions(&self) -> Result<Vec<SessionRecord>> {
        let mut statement = self.connection.prepare(
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
            LIMIT 12
            "#,
        )?;

        let rows = statement.query_map([], |row| {
            let status: String = row.get(8)?;
            Ok(SessionRecord {
                id: row.get(0)?,
                started_at: row.get(1)?,
                ended_at: row.get(2)?,
                elapsed_ms: row.get(3)?,
                totals: StateTotals {
                    on_screen: row.get(4)?,
                    writing: row.get(5)?,
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
                    writing: row.get(3)?,
                    away: row.get(4)?,
                    uncertain: row.get(5)?,
                },
            })
        })?;

        Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
    }

    fn rebuild_daily_summaries(&mut self) -> Result<()> {
        self.connection.execute("DELETE FROM daily_summaries", [])?;

        let mut statement = self.connection.prepare(
            r#"
            SELECT started_at, on_screen_ms, writing_ms, away_ms, uncertain_ms
            FROM sessions
            WHERE status = 'COMPLETED'
            "#,
        )?;

        let session_rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                StateTotals {
                    on_screen: row.get(1)?,
                    writing: row.get(2)?,
                    away: row.get(3)?,
                    uncertain: row.get(4)?,
                },
            ))
        })?;

        let mut buckets: BTreeMap<String, StateTotals> = BTreeMap::new();

        for row in session_rows {
            let (started_at, totals) = row?;
            let date = date_key_for_iso(&started_at);
            let entry = buckets.entry(date).or_insert_with(StateTotals::empty);
            entry.on_screen += totals.on_screen;
            entry.writing += totals.writing;
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
                    totals.writing,
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
            "DELETE FROM state_segments WHERE session_id IN (SELECT id FROM sessions WHERE started_at < ?1)",
            params![cutoff.clone()],
        )?;
        self.connection
            .execute("DELETE FROM sessions WHERE started_at < ?1", params![cutoff])?;
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
