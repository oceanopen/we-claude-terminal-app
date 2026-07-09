// 桌宠窗口：透明悬浮、置顶、无装饰、可拖拽。
//
//   transparent(true) + decorations(false) + always_on_top(true)
//   + skip_taskbar(true) + resizable(false) + shadow(false)
//
// 注：不做鼠标穿透——窗口的 128x128 矩形整体接收鼠标事件，牺牲矩形内
// 透明边角区域（会挡住下层）换取前端 mouseenter/cursor/拖拽的简单可靠。
//
// 初始位置：主屏右下角内缩 24px（避免被 Dock / 任务栏遮挡）。
// 尺寸：128x128 逻辑像素（足够展示 SVG 表情 + 状态徽章）。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::shared::config::{read_config_raw, write_config_raw, ConfigState};
use crate::shared::screen::{MonitorInfo, find_monitor_for_tray};
use crate::windows::pet_task;

/// 桌宠窗口尺寸（逻辑像素）。
const PET_SIZE: (f64, f64) = (128.0, 128.0);

/// 右下角内缩（逻辑像素），避开 Dock。
const PET_MARGIN: f64 = 24.0;

/// 持久化桌宠位置的 config key（逻辑坐标 JSON：`{"x":..,"y":..}`）。
const PET_POSITION_KEY: &str = "pet_position";

/// Moved 防抖时长：拖动期间频繁触发，停顿后落盘一次。
const PET_POSITION_DEBOUNCE_MS: u64 = 600;

#[derive(serde::Serialize, serde::Deserialize)]
struct PetPositionSaved {
    x: f64,
    y: f64,
}

/// 计算桌宠初始位置（主屏右下角内缩 PET_MARGIN）。
/// 找不到 tray 所在屏时用 available_monitors 的第一块屏兜底；都失败返回 (100, 100)。
fn pet_position(app: &AppHandle) -> (f64, f64) {
    // 优先用上次保存的位置；缺失或损坏时回退主屏右下角。
    if let Some(state) = app.try_state::<ConfigState>() {
        if let Ok(Some(raw)) = read_config_raw(&*state, PET_POSITION_KEY) {
            if let Ok(saved) = serde_json::from_str::<PetPositionSaved>(&raw) {
                return (saved.x.max(0.0), saved.y.max(0.0));
            }
        }
    }

    let monitor = find_monitor_for_tray(app, "tray").or_else(|| {
        app.available_monitors()
            .ok()
            .and_then(|ms| ms.first().map(MonitorInfo::from_monitor))
    });
    let Some(m) = monitor else {
        return (100.0, 100.0);
    };
    let x = m.wa_x + m.wa_width - PET_SIZE.0 - PET_MARGIN;
    let y = m.wa_y + m.wa_height - PET_SIZE.1 - PET_MARGIN;
    (x.max(0.0), y.max(0.0))
}

/// 创建或显示桌宠窗口。已存在则直接 show。
pub fn ensure_pet_window(app: &AppHandle) -> tauri::Result<()> {
    if let Some(w) = app.get_webview_window("pet") {
        let _ = w.show();
        return Ok(());
    }

    let (x, y) = pet_position(app);
    let win = WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("pet.html".into()))
        .title("Pet")
        .inner_size(PET_SIZE.0, PET_SIZE.1)
        .position(x, y)
        // 关键透明/置顶属性
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible(false) // 先建后显，避免首屏白闪
        .build()?;

    let w = win.clone();
    // Moved 防抖令牌：每次 Moved 置 true 取消上一个待保存任务；新任务 sleep 后 swap 检查。
    let cancel: Arc<AtomicBool> = Arc::new(AtomicBool::new(false));
    let app_for_move = app.clone();
    win.on_window_event(move |event| {
        match event {
            tauri::WindowEvent::Moved(_) => {
                cancel.store(true, Ordering::SeqCst);
                let token = cancel.clone();
                let app = app_for_move.clone();
                thread::spawn(move || {
                    thread::sleep(Duration::from_millis(PET_POSITION_DEBOUNCE_MS));
                    // 若防抖窗口内又来 Moved，本任务放弃，留给后到的任务落盘。
                    if token.swap(false, Ordering::SeqCst) {
                        return;
                    }
                    let Some(w) = app.get_webview_window("pet") else { return };
                    let Ok(scale) = w.scale_factor() else { return };
                    let Ok(phys) = w.outer_position() else { return };
                    let logical = phys.to_logical::<f64>(scale);
                    let raw = serde_json::to_string(&PetPositionSaved {
                        x: logical.x,
                        y: logical.y,
                    })
                    .unwrap_or_default();
                    if let Some(state) = app.try_state::<ConfigState>() {
                        let _ = write_config_raw(&*state, PET_POSITION_KEY, &raw);
                    }
                });
            }
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = w.hide();
            }
            _ => {}
        }
    });

    let _ = win.show();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn show_pet_window(app: AppHandle) -> Result<(), String> {
    ensure_pet_window(&app).map_err(|e| e.to_string())?;
    // pet 显示后联动评估 pet_task 显隐（show_pet_task 内部按 count 裁决），
    // 覆盖 pet 重新显示时前端 useEffect 因 count 未变不触发的边缘场景。
    pet_task::show_pet_task(app)
}

#[tauri::command]
#[specta::specta]
pub fn hide_pet_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("pet") {
        let _ = w.hide();
    }
    // pet 隐藏联动隐藏 pet_task，避免孤立的悬浮列表。
    pet_task::hide_pet_task(app)
}

#[tauri::command]
#[specta::specta]
pub fn toggle_pet_window(app: AppHandle) -> Result<bool, String> {
    let now_visible = if let Some(w) = app.get_webview_window("pet") {
        let visible = w.is_visible().unwrap_or(false);
        if visible {
            let _ = w.hide();
            false
        } else {
            let _ = w.show();
            true
        }
    } else {
        ensure_pet_window(&app).map_err(|e| e.to_string())?;
        true
    };
    // pet 显隐变化联动 pet_task：显示则按 count 裁决，隐藏则强制 hide。
    if now_visible {
        let _ = pet_task::show_pet_task(app.clone());
    } else {
        let _ = pet_task::hide_pet_task(app.clone());
    }
    Ok(now_visible)
}

/// 查询桌宠当前显隐状态。供前端启动时初始化 UI。
#[tauri::command]
#[specta::specta]
pub fn get_pet_visibility_state(app: AppHandle) -> bool {
    app.get_webview_window("pet")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false)
}

/// 内部工具：app 启动时调用，确保桌宠窗口存在且可见。
pub fn startup_show(app: &AppHandle) {
    if let Err(e) = ensure_pet_window(app) {
        log::warn!("[pet] startup ensure failed: {}", e);
    }
    // pet 显示后联动评估 pet_task 显隐（show_pet_task 内部按 count 裁决）。
    let _ = pet_task::show_pet_task(app.clone());
}
