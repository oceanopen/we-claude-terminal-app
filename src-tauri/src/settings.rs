use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn show_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    let settings_win = match app.get_webview_window("settings") {
        Some(w) => w,
        None => {
            let win =
                WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App("settings.html".into()))
                    .title("We Claude Terminal Monitor")
                    .inner_size(800.0, 600.0)
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

    let _ = settings_win.show();
    let _ = settings_win.unminimize();
    let _ = settings_win.set_focus();

    Ok(())
}
