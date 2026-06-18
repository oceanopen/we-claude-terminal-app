use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::shared::screen::{monitor_window_size, reposition_to_cursor};

#[tauri::command]
#[specta::specta]
pub fn show_monitor_window(app: tauri::AppHandle) -> Result<(), String> {
    let monitor_win = match app.get_webview_window("monitor") {
        Some(w) => w,
        None => {
            let (width, height) = monitor_window_size(&app);

            let win =
                WebviewWindowBuilder::new(&app, "monitor", WebviewUrl::App("monitor.html".into()))
                    .title("We Claude Terminal Monitor")
                    .inner_size(width, height)
                    // 默认在主屏居中；下方 reposition 修正到鼠标所在屏，探测失败保持主屏。
                    .center()
                    // 窗口不进任务栏与 Alt+Tab（Windows/Linux），macOS 上为 no-op（Dock 由 ActivationPolicy 控制）。
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

    // 新建和二次唤起都跟随当前鼠标屏重定位；在 show 之前调用，无视觉跳跃。
    reposition_to_cursor(&monitor_win, &app);

    let _ = monitor_win.show();
    let _ = monitor_win.unminimize();
    let _ = monitor_win.set_focus();

    Ok(())
}
