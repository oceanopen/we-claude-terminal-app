// panel 窗口（控制台）+ 桥接命令。
//
// 会话扫描 / watcher / poller 逻辑全部下沉到 sessions/ 域（见 crate::sessions）。
// 终端跳转逻辑全部下沉到 terminal/ 域（见 crate::terminal）。
// 本文件仅负责：窗口创建、命令包装（get_claude_sessions / navigate_to_claude_session）。

use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::shared::events::EVENT_CLAUDE_SESSION_NAV_FAILED;
use crate::shared::screen::{
    find_monitor_for_tray, ratio_size, work_area_center, DEFAULT_SIZE, PANEL_RATIO,
};
use crate::shared::state::claude_sessions::ClaudeSessionStore;
use crate::shared::types::ClaudeSessionInfo;
use crate::terminal::{NavErr, Target, dispatch};

#[tauri::command]
#[specta::specta]
pub fn get_claude_sessions(
    state: State<'_, ClaudeSessionStore>,
) -> Result<Vec<ClaudeSessionInfo>, String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    Ok(map.values().cloned().collect())
}

/// 手动刷新会话列表：触发全量重扫并广播 claude-sessions:changed，
/// 订阅该事件的前端（panel 的 ClaudeSessionsPage 页、pet_claude_sessions_summary、pet_claude_sessions_task）自动收到新快照。
/// force_git=true：手动刷新强制重算空闲会话的 GitPending，立即反映最新 git 状态。
#[tauri::command]
#[specta::specta]
pub fn refresh_sessions(app: AppHandle) -> Result<(), String> {
    crate::sessions::rescan(&app, true);
    Ok(())
}

/// 跳转到 pid 对应的宿主终端会话。
/// 成功返回 Ok(())；失败 emit `claude-sessions:nav-failed` 事件，
/// 前端据 NavErr.kind 渲染差异化 toast。
#[tauri::command]
#[specta::specta]
pub fn navigate_to_claude_session(pid: u32, app: AppHandle) -> Result<(), String> {
    // ClaudeSessionStore 查找：刚 expire 的会话走 SessionNotFound 路径，前端提示重试。
    let session = {
        let store = app.state::<ClaudeSessionStore>();
        let map = store.0.lock().map_err(|e| e.to_string())?;
        map.get(&pid.to_string()).cloned()
    };

    let Some(session) = session else {
        let _ = app.emit(EVENT_CLAUDE_SESSION_NAV_FAILED, &NavErr::SessionNotFound);
        return Ok(()); // emit 后视作"已通知前端"，命令本身不算失败。
    };

    // 构造 Target：仅 tty 用于跳转匹配（iTerm2 / Terminal.app 均只靠 tty）。
    let target = Target {
        tty: if session.tty.is_empty() {
            None
        } else {
            Some(&session.tty)
        },
    };

    if let Err(err) = dispatch(session.host_app, &target) {
        log::warn!(
            "[panel] navigate_to_claude_session pid={} host={:?} failed: {:?}",
            pid,
            session.host_app,
            err
        );
        let _ = app.emit(EVENT_CLAUDE_SESSION_NAV_FAILED, &err);
    }
    Ok(())
}

/// 用指定编辑器 CLI 打开项目目录。editor 仅允许 "vscode" / "idea" 两个枚举值，
/// 映射到 code / idea 命令；spawn 不阻塞（编辑器是长期运行的 GUI 进程）。
/// 命令不存在 / 启动失败返回 Err(String)，前端自行 warn 或提示。
#[tauri::command]
#[specta::specta]
pub fn open_in_editor(editor: String, cwd: String) -> Result<(), String> {
    let cmd = match editor.as_str() {
        "vscode" => "code",
        "idea" => "idea",
        other => return Err(format!("unsupported editor: {other}")),
    };
    std::process::Command::new(cmd)
        .arg(&cwd)
        // GUI 编辑器（IDEA / VSCode）启动会把自身日志写到继承的 stdout/stderr，
        // 污染 we-claude-terminal 的终端（IDEA 尤其嘈杂：Kotlin/Maven 插件 WARN、
        // Gradle daemon 失败堆栈等）。重定向到 null 让子进程静默。
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to launch {cmd}: {e}"))?;
    Ok(())
}

/// 判断 cwd 是否 Java 项目（Maven pom.xml 或 Gradle build.gradle/build.gradle.kts）。
/// 前端据此禁用 VSCode/IDEA 中不合适的那一个，保留两个按钮便于未来扩展。
#[tauri::command]
#[specta::specta]
pub fn is_java_project(cwd: String) -> bool {
    let path = std::path::Path::new(&cwd);
    path.join("pom.xml").exists()
        || path.join("build.gradle").exists()
        || path.join("build.gradle.kts").exists()
}

#[tauri::command]
#[specta::specta]
pub fn show_panel_window(app: tauri::AppHandle) -> Result<(), String> {
    let monitor = find_monitor_for_tray(&app, "tray");
    let (width, height) = monitor
        .as_ref()
        .map(|m| ratio_size(m, PANEL_RATIO))
        .unwrap_or(DEFAULT_SIZE);

    let panel_win = match app.get_webview_window("panel") {
        Some(w) => {
            let _ = w.set_size(LogicalSize::new(width, height));
            w
        }
        None => {
            let win =
                WebviewWindowBuilder::new(&app, "panel", WebviewUrl::App("panel.html".into()))
                    .title("控制台")
                    .inner_size(width, height)
                    .center()
                    .skip_taskbar(true)
                    .build()
                    .map_err(|e| e.to_string())?;

            let w = win.clone();
            win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = w.hide();
                }
            });

            win
        }
    };

    if let Some(m) = &monitor {
        let (x, y) = work_area_center(m, width, height);
        let _ = panel_win.set_position(LogicalPosition::new(x, y));
    }

    let _ = panel_win.show();
    let _ = panel_win.unminimize();
    let _ = panel_win.set_focus();

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    #[test]
    fn path_basename_fallback() {
        // 验证 Path::file_name 逻辑（enrich 也用同样模式取 project_name）。
        let name = Path::new("/Users/foo/proj").file_name().and_then(|s| s.to_str());
        assert_eq!(name, Some("proj"));
    }
}
