use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

use crate::shared::screen::{reposition_to_cursor, DEFAULT_SIZE};

#[tauri::command]
pub fn show_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    let settings_win = match app.get_webview_window("settings") {
        Some(w) => w,
        None => {
            let (width, height) = DEFAULT_SIZE;

            let win = WebviewWindowBuilder::new(
                &app,
                "settings",
                WebviewUrl::App("settings.html".into()),
            )
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
    reposition_to_cursor(&settings_win, &app);

    let _ = settings_win.show();
    let _ = settings_win.unminimize();
    let _ = settings_win.set_focus();

    Ok(())
}
