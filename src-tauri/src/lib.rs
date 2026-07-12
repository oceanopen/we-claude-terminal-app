mod sessions;
mod shared;
mod terminal;
mod windows;

use tauri::Listener;
use tauri_specta::{collect_commands, Builder};

// 集中注册所有 IPC 命令到 tauri-specta Builder。
// run()（注册 invoke handler）与 bin/export_bindings.rs（生成 TS 绑定）共用此函数，
// 保证命令清单单一来源，避免两份注册表漂移。
pub fn build_specta_builder() -> Builder<tauri::Wry> {
    use crate::shared::types::{ConfigChangedPayload, ClaudeSessionInfo, ClaudeSessionStatus, TerminalApp, YesNo};
    use crate::terminal::NavErr;
    Builder::<tauri::Wry>::new()
        .commands(collect_commands![
            windows::panel::show_panel_window,
            windows::panel::get_claude_sessions,
            windows::panel::refresh_sessions,
            windows::panel::navigate_to_claude_session,
            windows::panel::open_in_editor,
            windows::panel::is_java_project,
            windows::pet::show_pet_window,
            windows::pet::hide_pet_window,
            windows::pet::toggle_pet_window,
            windows::pet::get_pet_visibility_state,
            windows::pet_task::show_pet_task,
            windows::pet_task::hide_pet_task,
            windows::pet_task::fit_pet_task,
            windows::settings::show_settings_window,
            shared::config::get_config,
            shared::config::set_config,
        ])
        // 以下类型不出现在任何 command 签名中（仅作为事件载荷或前端数据模型），
        // 用 typ 显式注册，让 specta 把它们导出到 bindings.ts 供前端复用。
        .typ::<ConfigChangedPayload>()
        .typ::<ClaudeSessionStatus>()
        .typ::<TerminalApp>()
        .typ::<YesNo>()
        .typ::<ClaudeSessionInfo>()
        .typ::<NavErr>()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta_builder = build_specta_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app| {
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
            shared::state::claude_sessions::init(app)?;
            windows::tray::setup(app)?;

            // 先 rescan 填充 ClaudeSessionStore 并广播首批快照，保证后续 pet_task / pet
            // 窗口 React mount 后初次拉取 IPC 时 store 必有数据，根治启动期"0 个活跃"竞态。
            sessions::rescan(app.handle());

            // 预构建 pet_task 窗口（隐藏）：webview 异步加载，React mount 时机虽不确定，
            // 但 store 已满，初次 IPC 必拿到非空数据；后续 claude-sessions:changed 事件持续驱动。
            if let Err(e) = windows::pet_task::ensure(app.handle()) {
                log::warn!("[pet-task] startup ensure failed: {}", e);
            }

            sessions::watch::start(app.handle().clone());
            sessions::poll::start(app.handle().clone());

            // 桌宠显隐读 pet_visible 偏好：用户上次隐藏则保持隐藏，否则启动显示。
            // pet 显示后由前端基于 count 调 show_pet_task 联动面板显隐。
            windows::pet::startup_show(app.handle());
            // 托盘菜单在 setup 时基于窗口可见性初始化文案，此时 pet 窗口尚未创建，
            // 故恒为"显示桌宠"；startup_show 确定真实显隐后刷新一次以纠正文案。
            windows::tray::refresh_menu_texts(app.handle());

            specta_builder.mount_events(app);

            let handle = app.handle().clone();
            app.listen(crate::shared::events::EVENT_CONFIG_CHANGED, move |event| {
                let Ok(value) = serde_json::from_str::<serde_json::Value>(event.payload()) else {
                    return;
                };
                let key = value.get("key").and_then(|v| v.as_str());
                if key == Some(shared::config::LANGUAGE_KEY) {
                    windows::tray::refresh_menu_texts(&handle);
                } else if key == Some(shared::config::POLL_INTERVAL_SECS_KEY) {
                    if let Some(secs) = value
                        .get("value")
                        .and_then(|v| v.as_str())
                        .and_then(|s| s.parse::<u64>().ok())
                    {
                        sessions::poll::set_interval(&handle, secs);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
