use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};

use crate::shared::config::{
    read_config_raw, write_config_raw, ConfigState, LANGUAGE_KEY, PET_DRAGGABLE_KEY,
};
use crate::shared::events::EVENT_CONFIG_CHANGED;
use crate::shared::i18n::{menu_text, resolve, ResolvedLanguage};
use crate::shared::types::{ConfigChangedPayload, YesNo};
use crate::windows::pet::get_pet_visibility_state;

/// 已构建的托盘菜单项引用，用于后续动态更新文案。
struct TrayMenuItems {
    monitor: MenuItem<tauri::Wry>,
    settings: MenuItem<tauri::Wry>,
    pet: MenuItem<tauri::Wry>,
    drag: MenuItem<tauri::Wry>,
    restart: MenuItem<tauri::Wry>,
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

/// 读取持久化的桌宠拖拽开关。缺失或非 "Y" 均视为关闭（默认不可拖拽）。
fn drag_enabled_pref(app: &AppHandle) -> bool {
    let Some(state) = app.try_state::<ConfigState>() else {
        return false;
    };
    match read_config_raw(state.inner(), PET_DRAGGABLE_KEY) {
        Ok(Some(v)) if v == YesNo::Yes.as_str() => true,
        _ => false,
    }
}

/// 拖拽开关当前态 → menu text key。已开启显示"关闭拖拽"，未开启显示"开启拖拽"
/// （动作指向目标态，与 pet-show/pet-hide 一致）。
fn drag_menu_key(app: &AppHandle) -> &'static str {
    if drag_enabled_pref(app) {
        "drag-off"
    } else {
        "drag-on"
    }
}

pub fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    // dev 模式用带 DEV 角标的图标，避免本地调试版与正式安装版在状态栏混淆。
    // include_bytes! 返回编译期固定大小数组 &[u8; N]，两套图标字节数不同，
    // 用 as_slice 统一为 &[u8]，cfg!(debug_assertions) 在编译期求值后编译器只保留对应分支。
    let icon_bytes: &[u8] = if cfg!(debug_assertions) {
        include_bytes!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/icons/32x32-dev.png"
        ))
        .as_slice()
    } else {
        include_bytes!(concat!(env!("CARGO_MANIFEST_DIR"), "/icons/32x32.png")).as_slice()
    };
    let icon = tauri::image::Image::from_bytes(icon_bytes).expect("failed to load tray icon");

    let tooltip = if cfg!(debug_assertions) {
        "We Claude Terminal [DEV]"
    } else {
        "We Claude Terminal"
    };

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
    // 拖拽开关：初始禁用，由首次 refresh_menu_texts 按桌宠显隐纠正。
    let drag_item = MenuItem::with_id(
        app,
        "drag",
        menu_text(lang, drag_menu_key(app.handle())),
        false,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, "quit", menu_text(lang, "quit"), true, None::<&str>)?;
    let restart_item = MenuItem::with_id(
        app,
        "restart",
        menu_text(lang, "restart"),
        true,
        None::<&str>,
    )?;

    let menu = Menu::with_items(
        app,
        &[
            &monitor_item,
            &PredefinedMenuItem::separator(app)?,
            &pet_item,
            &drag_item,
            &PredefinedMenuItem::separator(app)?,
            &settings_item,
            &restart_item,
            &quit_item,
        ],
    )?;

    TrayIconBuilder::with_id("tray")
        .icon(icon)
        .tooltip(tooltip)
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
                // 切换后立刻刷新菜单文案（pet 文案 + drag enabled 都依赖显隐态）。
                crate::windows::tray::refresh_menu_texts(app);
            }
            "drag" => {
                // 翻转拖拽开关：落盘后广播 config-changed 通知前端 PetApp 实时响应，再刷新菜单文案。
                // drag 的 enabled 只随桌宠显隐变化，不由此处改变。
                let new_val = if drag_enabled_pref(app) {
                    YesNo::No
                } else {
                    YesNo::Yes
                };
                if let Some(state) = app.try_state::<ConfigState>() {
                    let _ = write_config_raw(state.inner(), PET_DRAGGABLE_KEY, new_val.as_str());
                }
                let _ = app.emit(
                    EVENT_CONFIG_CHANGED,
                    ConfigChangedPayload {
                        key: PET_DRAGGABLE_KEY.to_string(),
                        value: new_val.as_str().to_string(),
                    },
                );
                crate::windows::tray::refresh_menu_texts(app);
            }
            "settings" => {
                if let Err(e) = crate::windows::settings::show_settings_window(app.clone()) {
                    log::warn!("failed to open settings window: {e}");
                }
            }
            "restart" => {
                app.restart();
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
        drag: drag_item,
        restart: restart_item,
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
    // drag 文案随开关状态切换；enabled 随桌宠显隐（隐藏时禁用，避免无桌宠时操作）。
    let _ = items.drag.set_text(menu_text(lang, drag_menu_key(app)));
    let _ = items.drag.set_enabled(get_pet_visibility_state(app.clone()));
    let _ = items.restart.set_text(menu_text(lang, "restart"));
    let _ = items.quit.set_text(menu_text(lang, "quit"));
}
