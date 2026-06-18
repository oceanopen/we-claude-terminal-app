mod monitor;
mod shared;
mod settings;
mod tray;

use tauri::Listener;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // macOS 隐藏 Dock 图标：将应用激活策略设为 Accessory（代理应用），
            // 应用不再出现在程序坞和应用菜单栏，只保留顶部状态栏托盘图标。
            // 该 API 仅 macOS 生效；Windows/Linux 任务栏隐藏由各窗口的 skip_taskbar(true) 负责。
            #[cfg(target_os = "macos")]
            {
                let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            shared::config::init(app)?;
            tray::setup(app)?;

            let handle = app.handle().clone();
            app.listen("config-changed", move |event| {
                let Ok(value) = serde_json::from_str::<serde_json::Value>(event.payload()) else {
                    return;
                };
                if value.get("key").and_then(|v| v.as_str()) == Some(shared::config::LANGUAGE_KEY) {
                    tray::refresh_menu_texts(&handle);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            shared::config::get_config,
            shared::config::set_config,
            monitor::show_monitor_window,
            settings::show_settings_window
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
