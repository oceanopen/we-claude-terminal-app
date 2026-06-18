use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

use crate::config::{read_config_raw, ConfigState, LANGUAGE_KEY};
use crate::i18n::{menu_text, resolve, ResolvedLanguage};

/// 已构建的托盘菜单项引用，用于后续动态更新文案。
struct TrayMenuItems {
    settings: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

fn current_language(app: &AppHandle) -> ResolvedLanguage {
    let Some(state) = app.try_state::<ConfigState>() else {
        return resolve(None);
    };
    let raw = read_config_raw(state.inner(), LANGUAGE_KEY).unwrap_or(None);
    resolve(raw.as_deref())
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/32x32.png"))
        .expect("failed to load tray icon");

    let lang = current_language(app.handle());

    let settings_item = MenuItem::with_id(
        app,
        "settings",
        menu_text(lang, "settings"),
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", menu_text(lang, "quit"), true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &settings_item,
            &PredefinedMenuItem::separator(app)?,
            &quit_item,
        ],
    )?;

    TrayIconBuilder::with_id("tray")
        .icon(icon)
        .tooltip("We Claude Terminal Monitor")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "settings" => {
                if let Err(e) = crate::settings::show_settings_window(app.clone()) {
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
        settings: settings_item,
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
    let _ = items.settings.set_text(menu_text(lang, "settings"));
    let _ = items.quit.set_text(menu_text(lang, "quit"));
}
