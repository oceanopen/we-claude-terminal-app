// 全量重扫：discover → enrich → 写 SessionStore → emit sessions-changed。
//
// 保证 Dead 会话立即从列表消失。emit 失败 / write 失败不阻塞主流程——
// 下一轮 watcher / poller 会重新执行，对齐现有容错风格。

use tauri::{AppHandle, Emitter, Manager};

use crate::sessions::discover;
use crate::sessions::enrich;
use crate::shared::events::EVENT_MONITOR_SESSIONS_CHANGED;
use crate::shared::state::monitor::{SessionStore, write_sessions};
use crate::shared::types::{SessionInfo, TerminalApp};

/// 全量重扫会话目录并刷新前端。
///
/// 调用点：
///   - lib.rs setup 末尾（启动时初始化）
///   - sessions::watch 收到 fs 事件后
///   - sessions::poll 周期触发
///
/// 仅输出数量日志：调用方高频触发，详情日志会刷屏。
pub fn rescan(app: &AppHandle) {
    let raws = discover::list_active();
    // 过滤 Unknown 宿主：终端被关闭后孤立的 claude 进程 parent chain 爬到 launchd
    // 也匹配不到已知终端，跳转按钮本来就是禁用的，留在列表里只会误导用户。
    let sessions: Vec<SessionInfo> = raws
        .iter()
        .map(enrich::enrich)
        .filter(|s| s.host_app != TerminalApp::Unknown)
        .collect();

    let count = sessions.len();
    // write_sessions 是替换式 move 写入，emit 需要先 clone 一份快照复用。
    let snapshot = sessions.clone();
    let store = app.state::<SessionStore>();
    write_sessions(&store, sessions);

    if let Err(e) = app.emit(EVENT_MONITOR_SESSIONS_CHANGED, &snapshot) {
        log::warn!("[sessions] emit sessions-changed failed: {}", e);
    }

    log::info!("[sessions] rescan: {} session(s)", count);
}
