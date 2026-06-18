use rusqlite::{params, Connection, OptionalExtension};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::shared::types::ConfigChangedPayload;

pub const LANGUAGE_KEY: &str = "language";

pub struct ConfigState(pub Mutex<Connection>);

pub fn init(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let app_data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("app.db");
    let conn = Connection::open(db_path)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
        [],
    )?;
    app.manage(ConfigState(Mutex::new(conn)));
    Ok(())
}

pub fn read_config_conn(conn: &Connection, key: &str) -> Result<Option<String>, String> {
    let mut stmt = conn
        .prepare("SELECT value FROM config WHERE key = ?1")
        .map_err(|e| e.to_string())?;
    stmt.query_row(params![key], |row| row.get::<_, String>(0))
        .optional()
        .map_err(|e| e.to_string())
}

pub fn read_config_raw(state: &ConfigState, key: &str) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    read_config_conn(&conn, key)
}

pub fn write_config_conn(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn write_config_raw(state: &ConfigState, key: &str, value: &str) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    write_config_conn(&conn, key, value)
}

#[tauri::command]
#[specta::specta]
pub fn get_config(state: State<'_, ConfigState>, key: String) -> Result<Option<String>, String> {
    read_config_raw(&state, &key)
}

#[tauri::command]
#[specta::specta]
pub fn set_config(
    app: AppHandle,
    state: State<'_, ConfigState>,
    key: String,
    value: String,
) -> Result<(), String> {
    write_config_raw(&state, &key, &value)?;
    app.emit(
        crate::shared::events::EVENT_CONFIG_CHANGED,
        ConfigChangedPayload { key, value },
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
