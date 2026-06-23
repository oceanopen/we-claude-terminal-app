use std::collections::HashMap;
use std::sync::Mutex;

use tauri::{App, Manager};

use crate::shared::types::SessionInfo;

// 字段暂无读写访问（后端采集未接入），待 rescan / get_monitor_sessions 接入后移除。
#[allow(dead_code)]
#[derive(Default)]
pub struct SessionStore(pub Mutex<HashMap<String, SessionInfo>>);

pub fn init(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(SessionStore::default());
    Ok(())
}
