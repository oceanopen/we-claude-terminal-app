use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn show_monitor_window(app: tauri::AppHandle) -> Result<(), String> {
    let monitor_win = match app.get_webview_window("monitor") {
        Some(w) => w,
        None => {
            let (width, height) = monitor_window_size(&app);
            let win =
                WebviewWindowBuilder::new(&app, "monitor", WebviewUrl::App("monitor.html".into()))
                    .title("We Claude Terminal Monitor")
                    .inner_size(width, height)
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

    let _ = monitor_win.show();
    let _ = monitor_win.unminimize();
    let _ = monitor_win.set_focus();

    Ok(())
}

/// 取鼠标当前所在屏幕的 80% 逻辑像素尺寸作为窗口初始尺寸。
/// 依次回退到主屏幕、固定默认值，保证极端环境也能打开窗口。
fn monitor_window_size(app: &tauri::AppHandle) -> (f64, f64) {
    const RATIO: f64 = 0.8;
    const FALLBACK: (f64, f64) = (800.0, 600.0);

    let monitor = app
        .cursor_position()
        .ok()
        .and_then(|pos| app.monitor_from_point(pos.x, pos.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten());

    let Some(monitor) = monitor else {
        return FALLBACK;
    };

    let scale = monitor.scale_factor();
    if scale <= 0.0 {
        return FALLBACK;
    }

    let size = monitor.size();
    let width = size.width as f64 / scale * RATIO;
    let height = size.height as f64 / scale * RATIO;
    (width, height)
}
