// 监控窗口 + 桥接命令。
//
// 会话扫描 / watcher / poller 逻辑全部下沉到 sessions/ 域（见 crate::sessions）。
// 终端跳转逻辑全部下沉到 terminal/ 域（见 crate::terminal）。
// 本文件仅负责：窗口创建、命令包装（get_monitor_sessions / navigate_to_session）。

use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::shared::events::EVENT_SESSION_NAV_FAILED;
use crate::shared::screen::{
    find_monitor_for_tray, ratio_size, work_area_center, DEFAULT_SIZE, MONITOR_RATIO,
};
use crate::shared::state::monitor::SessionStore;
use crate::shared::types::SessionInfo;
use crate::terminal::{NavErr, Target, dispatch};

#[tauri::command]
#[specta::specta]
pub fn get_monitor_sessions(
    state: State<'_, SessionStore>,
) -> Result<Vec<SessionInfo>, String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    Ok(map.values().cloned().collect())
}

/// 跳转到 pid 对应的宿主终端会话。
/// 成功返回 Ok(())；失败 emit `monitor:session-navigation-failed` 事件，
/// 前端据 NavErr.kind 渲染差异化 toast。
#[tauri::command]
#[specta::specta]
pub fn navigate_to_session(pid: u32, app: AppHandle) -> Result<(), String> {
    // SessionStore 查找：刚 expire 的会话走 SessionNotFound 路径，前端提示重试。
    let session = {
        let store = app.state::<SessionStore>();
        let map = store.0.lock().map_err(|e| e.to_string())?;
        map.get(&pid.to_string()).cloned()
    };

    let Some(session) = session else {
        let _ = app.emit(EVENT_SESSION_NAV_FAILED, &NavErr::SessionNotFound);
        return Ok(()); // emit 后视作"已通知前端"，命令本身不算失败。
    };

    // 构造 Target：home_cwd 为 ~/basename 形式。
    let home_cwd = home_relative_cwd(&session.cwd);
    let target = Target {
        tty: if session.tty.is_empty() {
            None
        } else {
            Some(&session.tty)
        },
        cwd: &session.cwd,
        home_cwd: home_cwd.as_deref(),
        project_name: &session.project_name,
    };

    if let Err(err) = dispatch(session.host_app, &target) {
        log::warn!(
            "[monitor] navigate_to_session pid={} host={:?} failed: {:?}",
            pid,
            session.host_app,
            err
        );
        let _ = app.emit(EVENT_SESSION_NAV_FAILED, &err);
    }
    Ok(())
}

/// 把 /Users/foo/proj 转为 ~/proj。路径无 home 前缀时返回 None。
fn home_relative_cwd(cwd: &str) -> Option<String> {
    let home = dirs::home_dir()?;
    let home_str = home.to_string_lossy();
    if cwd == home_str {
        Some("~".to_string())
    } else {
        cwd.strip_prefix(&*home_str).map(|rest| format!("~{}", rest))
    }
}

#[tauri::command]
#[specta::specta]
pub fn show_monitor_window(app: tauri::AppHandle) -> Result<(), String> {
    let monitor = find_monitor_for_tray(&app, "tray");
    let (width, height) = monitor
        .as_ref()
        .map(|m| ratio_size(m, MONITOR_RATIO))
        .unwrap_or(DEFAULT_SIZE);

    let monitor_win = match app.get_webview_window("monitor") {
        Some(w) => {
            let _ = w.set_size(LogicalSize::new(width, height));
            w
        }
        None => {
            let win =
                WebviewWindowBuilder::new(&app, "monitor", WebviewUrl::App("monitor.html".into()))
                    .title("We Claude Terminal Monitor")
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
        let _ = monitor_win.set_position(LogicalPosition::new(x, y));
    }

    let _ = monitor_win.show();
    let _ = monitor_win.unminimize();
    let _ = monitor_win.set_focus();

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn home_relative_cwd_handles_typical_paths() {
        // home_dir 在测试环境下指向当前用户 home。
        let home = dirs::home_dir().unwrap().to_string_lossy().to_string();

        assert_eq!(home_relative_cwd(&home), Some("~".to_string()));
        assert_eq!(
            home_relative_cwd(&format!("{}/proj", home)),
            Some("~/proj".to_string())
        );
        // 非 home 前缀路径返回 None。
        assert_eq!(home_relative_cwd("/etc"), None);
    }

    #[test]
    fn path_basename_fallback() {
        // 与 home_relative_cwd 无直接关系，但验证 Path::file_name 逻辑（enrich 也用同样模式）。
        let name = Path::new("/Users/foo/proj").file_name().and_then(|s| s.to_str());
        assert_eq!(name, Some("proj"));
    }
}
