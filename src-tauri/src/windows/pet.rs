// 桌宠窗口：透明悬浮、置顶、无装饰、可拖拽、按需关闭鼠标穿透。
//
//   transparent(true) + decorations(false) + always_on_top(true)
//   + skip_taskbar(true) + resizable(false) + shadow(false)
//   + set_ignore_cursor_events(true) 让点击穿透到下层窗口
//   + 前端 mouseenter/leave 调 set_pet_click_through 切换穿透态
//
// 初始位置：主屏右下角内缩 24px（避免被 Dock / 任务栏遮挡）。
// 尺寸：128x128 逻辑像素（足够展示 SVG 表情 + 状态徽章）。

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::shared::screen::{MonitorInfo, find_monitor_for_tray};

/// 桌宠窗口尺寸（逻辑像素）。
const PET_SIZE: (f64, f64) = (128.0, 128.0);

/// 右下角内缩（逻辑像素），避开 Dock。
const PET_MARGIN: f64 = 24.0;

/// 计算桌宠初始位置（主屏右下角内缩 PET_MARGIN）。
/// 找不到 tray 所在屏时用 available_monitors 的第一块屏兜底；都失败返回 (100, 100)。
fn pet_position(app: &AppHandle) -> (f64, f64) {
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

    // 鼠标穿透：默认开启，前端 mouseenter 时调 set_pet_click_through(false) 关闭。
    let _ = win.set_ignore_cursor_events(true);

    let w = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = w.hide();
        }
    });

    let _ = win.show();
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn show_pet_window(app: AppHandle) -> Result<(), String> {
    ensure_pet_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn hide_pet_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("pet") {
        let _ = w.hide();
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn toggle_pet_window(app: AppHandle) -> Result<bool, String> {
    if let Some(w) = app.get_webview_window("pet") {
        let visible = w.is_visible().unwrap_or(false);
        if visible {
            let _ = w.hide();
            Ok(false)
        } else {
            let _ = w.show();
            Ok(true)
        }
    } else {
        ensure_pet_window(&app).map_err(|e| e.to_string())?;
        Ok(true)
    }
}

/// 前端 mouseenter/leave 调用，控制桌宠窗口的鼠标穿透态。
/// mouseenter → enabled=false（接收点击）；mouseleave → enabled=true（穿透到下层）。
#[tauri::command]
#[specta::specta]
pub fn set_pet_click_through(app: AppHandle, enabled: bool) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("pet") {
        let _ = w.set_ignore_cursor_events(!enabled);
    }
    Ok(())
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
}
