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

/// 替换式写入：clear 后按 session_id 为 key 全量 insert。
/// 替换而非合并，保证消失的会话被清除（对齐 Task 17 rescan 语义）。
pub fn write_sessions(store: &SessionStore, sessions: Vec<SessionInfo>) {
    let mut map = store
        .0
        .lock()
        .expect("SessionStore mutex poisoned");
    map.clear();
    for s in sessions {
        map.insert(s.session_id.clone(), s);
    }
}
