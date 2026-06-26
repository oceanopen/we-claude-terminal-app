use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

use crate::shared::config::{read_config_raw, ConfigState, LANGUAGE_KEY};
use crate::shared::i18n::{menu_text, resolve, ResolvedLanguage};
use crate::windows::pet::get_pet_visibility_state;

/// 已构建的托盘菜单项引用，用于后续动态更新文案。
struct TrayMenuItems {
    monitor: MenuItem<tauri::Wry>,
    settings: MenuItem<tauri::Wry>,
    pet: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

fn current_language(app: &AppHandle) -> ResolvedLanguage {
    let Some(state) = app.try_state::<ConfigState>() else {
        return resolve(None);
    };
    let raw = read_config_raw(state.inner(), LANGUAGE_KEY).unwrap_or(None);
    resolve(raw.as_deref())
}

/// 桌宠当前显隐 → menu text key。隐藏时显示"显示桌宠"，显示时显示"隐藏桌宠"。
fn pet_menu_key(app: &AppHandle) -> &'static str {
    if get_pet_visibility_state(app.clone()) {
        "pet-hide"
    } else {
        "pet-show"
    }
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let icon = tauri::image::Image::from_bytes(include_bytes!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/icons/32x32.png"
    )))
    .expect("failed to load tray icon");

    let lang = current_language(app.handle());

    let monitor_item = MenuItem::with_id(
        app,
        "monitor",
        menu_text(lang, "monitor"),
        true,
        None::<&str>,
    )?;
    let settings_item = MenuItem::with_id(
        app,
        "settings",
        menu_text(lang, "settings"),
        true,
        None::<&str>,
    )?;
    let pet_item = MenuItem::with_id(
        app,
        "pet",
        menu_text(lang, pet_menu_key(app.handle())),
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", menu_text(lang, "quit"), true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &monitor_item,
            &PredefinedMenuItem::separator(app)?,
            &pet_item,
            &PredefinedMenuItem::separator(app)?,
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;

    TrayIconBuilder::with_id("tray")
        .icon(icon)
        .tooltip("We Claude Terminal")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "monitor" => {
                if let Err(e) = crate::windows::monitor::show_monitor_window(app.clone()) {
                    log::warn!("failed to open monitor window: {e}");
                }
            }
            "pet" => {
                if let Err(e) = crate::windows::pet::toggle_pet_window(app.clone()) {
                    log::warn!("failed to toggle pet window: {e}");
                }
                // 切换后立刻刷新菜单文案。
                crate::windows::tray::refresh_menu_texts(app);
            }
            "settings" => {
                if let Err(e) = crate::windows::settings::show_settings_window(app.clone()) {
                    log::warn!("failed to open settings window: {e}");
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    app.manage(Mutex::new(TrayMenuItems {
        monitor: monitor_item,
        settings: settings_item,
        pet: pet_item,
        quit: quit_item,
    }));

    Ok(())
}

pub fn refresh_menu_texts(app: &AppHandle) {
    let Some(state) = app.try_state::<Mutex<TrayMenuItems>>() else {
        return;
    };
    let Ok(items) = state.lock() else {
        return;
    };
    let lang = current_language(app);
    let _ = items.monitor.set_text(menu_text(lang, "monitor"));
    let _ = items.settings.set_text(menu_text(lang, "settings"));
    let _ = items.pet.set_text(menu_text(lang, pet_menu_key(app)));
    let _ = items.quit.set_text(menu_text(lang, "quit"));
}
