mod database;
mod models;

use std::fs;
use std::sync::Mutex;

use anyhow::{Context, Result as AnyResult};
use tauri::{Manager, State};

use crate::database::Database;
use crate::models::{
    AppSettings, BootstrapPayload, ExportBundle, PersistedSegmentInput, SessionCompletionInput,
    SessionSeed,
};

struct AppState {
    database: Mutex<Database>,
}

#[tauri::command]
fn bootstrap(state: State<'_, AppState>) -> std::result::Result<BootstrapPayload, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?
        .bootstrap()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn create_session(
    state: State<'_, AppState>,
    started_at: String,
) -> std::result::Result<SessionSeed, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?
        .create_session(started_at)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn append_state_segment(
    state: State<'_, AppState>,
    segment: PersistedSegmentInput,
) -> std::result::Result<(), String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?
        .append_state_segment(segment)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn finish_session(
    state: State<'_, AppState>,
    payload: SessionCompletionInput,
) -> std::result::Result<BootstrapPayload, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?
        .finish_session(payload)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_session(
    state: State<'_, AppState>,
    session_id: String,
) -> std::result::Result<BootstrapPayload, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?
        .delete_session(session_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_settings(
    state: State<'_, AppState>,
    settings: AppSettings,
) -> std::result::Result<BootstrapPayload, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?
        .save_settings(settings)
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn export_data(state: State<'_, AppState>) -> std::result::Result<ExportBundle, String> {
    state
        .database
        .lock()
        .map_err(|_| "database lock poisoned".to_string())?
        .export_data()
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            initialize_database(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap,
            create_session,
            append_state_segment,
            finish_session,
            delete_session,
            save_settings,
            export_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn initialize_database(app: &mut tauri::App) -> AnyResult<()> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .context("failed to resolve app data directory")?;
    fs::create_dir_all(&app_data_dir)?;
    let database_path = app_data_dir.join("focus-estimate.sqlite");
    let database = Database::new(&database_path)?;
    app.manage(AppState {
        database: Mutex::new(database),
    });
    Ok(())
}
