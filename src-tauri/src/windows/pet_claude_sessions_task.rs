// 桌宠任务面板窗口：紧贴桌宠左侧悬浮，显隐由 pet 前端基于 count 驱动。
//
//   transparent(true) + decorations(false) + always_on_top(true)
//   + skip_taskbar(true) + resizable(false) + shadow(false)
//
// 显隐主导权在 pet 前端：PetClaudeSessionsSummaryApp 收到 claude-sessions:changed payload 算出 count，
// count > 0 调 show_pet_claude_sessions_task_window，count == 0 调 hide_pet_claude_sessions_task_window。
// show_pet_claude_sessions_task_window 内部按 (pet 可见 && active count > 0) 最终裁决，覆盖 pet
// 显隐命令联动兜底场景（pet 重新显示时前端 useEffect 因 count 未变不触发）。
// pet 隐藏时由 hide_pet_claude_sessions_summary_window 命令直接调 hide_pet_claude_sessions_task_window，避免孤立悬浮列表。
//
// 位置每次 show 时重算，跟随 pet 当前位置；左屏边缘自动翻转到 pet 右侧，Y 夹紧 work_area。

use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::shared::screen::MonitorInfo;
use crate::shared::state::claude_sessions::ClaudeSessionStore;
use crate::shared::types::ClaudeSessionStatus;

/// 任务面板窗口 label（前端 get_webview_window 与 HTML 文件名均与此对齐）。
const PET_CLAUDE_SESSIONS_TASK_LABEL: &str = "pet-claude-sessions-task";

/// 面板宽度（逻辑像素）：固定，仅高度随内容动态变化。
const PET_CLAUDE_SESSIONS_TASK_WIDTH: f64 = 280.0;

/// 面板默认高度（逻辑像素）：用作 ensure 初始尺寸与 show 时兜底定位；
/// 前端 mount 后 ResizeObserver 会回调 fit_pet_claude_sessions_task 用实际高度覆盖。
const PET_CLAUDE_SESSIONS_TASK_DEFAULT_HEIGHT: f64 = 340.0;

/// pet 与面板之间的缝隙。设为 0 让两窗口紧贴。
const PET_CLAUDE_SESSIONS_TASK_GAP: f64 = 0.0;

/// 根据 pet 当前外接矩形 + 所在屏 work_area + 面板实际高度，算面板逻辑坐标。
/// 默认放 pet 左侧垂直居中（panel 中心 Y 对齐 pet 中心 Y）；左侧放不下翻转到右侧；
/// Y 夹紧到 work_area 内。pet 不可见或拿不到几何时返回 None。
fn position_near_pet(pet: &tauri::WebviewWindow, panel_h: f64) -> Option<(f64, f64)> {
    let monitor = pet.current_monitor().ok()??;
    let m = MonitorInfo::from_monitor(&monitor);
    let scale = pet.scale_factor().ok()?;

    let pet_phys = pet.outer_position().ok()?;
    let pet_size = pet.outer_size().ok()?;
    let pet_x = pet_phys.x as f64 / scale;
    let pet_y = pet_phys.y as f64 / scale;
    let pet_w = pet_size.width as f64 / scale;
    let pet_h = pet_size.height as f64 / scale;

    let panel_w = PET_CLAUDE_SESSIONS_TASK_WIDTH;
    let pet_cy = pet_y + pet_h / 2.0;

    // 默认放 pet 左侧；左屏边缘放不下时翻转到右侧（贴近 pet 右边）。
    let left_x = pet_x - panel_w - PET_CLAUDE_SESSIONS_TASK_GAP;
    let panel_x = if left_x < m.wa_x {
        pet_x + pet_w + PET_CLAUDE_SESSIONS_TASK_GAP
    } else {
        left_x
    };

    // Y 夹紧 work_area：先试图与 pet 垂直居中，超出则贴顶/贴底。
    let mut panel_y = pet_cy - panel_h / 2.0;
    if panel_y < m.wa_y {
        panel_y = m.wa_y;
    }
    let max_y = m.wa_y + m.wa_height - panel_h;
    if panel_y > max_y {
        panel_y = max_y;
    }

    Some((panel_x.max(0.0), panel_y.max(0.0)))
}

/// 创建任务面板窗口（不可见）。已存在则 no-op。窗口属性与 pet 同款透明悬浮。
pub fn ensure(app: &AppHandle) -> tauri::Result<()> {
    if app.get_webview_window(PET_CLAUDE_SESSIONS_TASK_LABEL).is_some() {
        return Ok(());
    }

    let win = WebviewWindowBuilder::new(
        app,
        PET_CLAUDE_SESSIONS_TASK_LABEL,
        WebviewUrl::App("pet-claude-sessions-task.html".into()),
    )
    .title("Pet Task")
    .inner_size(PET_CLAUDE_SESSIONS_TASK_WIDTH, PET_CLAUDE_SESSIONS_TASK_DEFAULT_HEIGHT)
    .transparent(true)
    .decorations(false)
    .always_on_top(true)
    .skip_taskbar(true)
    // 不设 resizable(false)：fit_pet_claude_sessions_task 用 set_size 动态调整高度跟随内容
    .shadow(false) // 透明窗 + MUI Paper 自绘阴影更可控（macOS 原生阴影与圆角不贴合）
    .focused(false)
    .visible(false) // 先建后显，避免首屏白闪
    .build()?;

    let w = win.clone();
    win.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = w.hide();
        }
    });

    Ok(())
}

/// 显示 pet_claude_sessions_task 面板：仅当 pet 可见且存在活跃会话（Busy+Waiting）时 show + 定位，
/// 否则 hide。显隐主导权在 pet 前端（基于 claude-sessions:changed payload 的 count），
/// 本命令作为前端驱动入口；pet 显隐命令也调用它做联动兜底。
///
/// 活跃会话口径与前端 isActiveClaudeSession / countActiveClaudeSessions 一致（SSOT: sessionStatus.ts）。
#[tauri::command]
#[specta::specta]
pub fn show_pet_claude_sessions_task_window(app: AppHandle) -> Result<(), String> {
    let pet_visible = app
        .get_webview_window("pet-claude-sessions-summary")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);

    let active_count = match app.try_state::<ClaudeSessionStore>() {
        Some(store) => {
            let Ok(map) = store.0.lock() else { return Ok(()); };
            map.values()
                .filter(|s| matches!(s.status, ClaudeSessionStatus::Busy | ClaudeSessionStatus::Waiting))
                .count()
        }
        None => return Ok(()),
    };

    if !pet_visible || active_count == 0 {
        if let Some(w) = app.get_webview_window(PET_CLAUDE_SESSIONS_TASK_LABEL) {
            let _ = w.hide();
        }
        return Ok(());
    }

    ensure(&app).map_err(|e| e.to_string())?;
    let Some(task_win) = app.get_webview_window(PET_CLAUDE_SESSIONS_TASK_LABEL) else {
        return Ok(());
    };
    if let Some(pet) = app.get_webview_window("pet-claude-sessions-summary") {
        // show 时前端尚未 mount 测量，先用默认高度定位；前端 ResizeObserver 首回调会
        // 通过 fit_pet_claude_sessions_task 用实际高度覆盖，保持与 pet 中心水平对齐。
        if let Some((x, y)) = position_near_pet(&pet, PET_CLAUDE_SESSIONS_TASK_DEFAULT_HEIGHT) {
            let _ = task_win.set_position(LogicalPosition::new(x, y));
        }
    }
    let _ = task_win.show();
    Ok(())
}

/// 隐藏 pet_claude_sessions_task 面板。pet 隐藏时由后端 hide_pet_claude_sessions_summary_window 命令联动调用，
/// 避免孤立的悬浮列表；pet 前端 count 归零时也主动调用。
#[tauri::command]
#[specta::specta]
pub fn hide_pet_claude_sessions_task_window(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(PET_CLAUDE_SESSIONS_TASK_LABEL) {
        let _ = w.hide();
    }
    Ok(())
}

/// 前端测得实际内容高度后回调，调整窗口高度并重新定位以保持与 pet 中心水平对齐。
/// 由 PetClaudeSessionsTaskApp 的 ResizeObserver（rAF 节流）触发；窗口已可见，不需 show。
/// 高度变化时 Y 按 panel 中心 = pet 中心重算，保证增减会话不破坏水平对齐。
#[tauri::command]
#[specta::specta]
pub fn fit_pet_claude_sessions_task(app: AppHandle, height: f64) -> Result<(), String> {
    let Some(task_win) = app.get_webview_window(PET_CLAUDE_SESSIONS_TASK_LABEL) else {
        return Ok(());
    };
    let _ = task_win.set_size(LogicalSize::new(PET_CLAUDE_SESSIONS_TASK_WIDTH, height));
    if let Some(pet) = app.get_webview_window("pet-claude-sessions-summary") {
        if let Some((x, y)) = position_near_pet(&pet, height) {
            let _ = task_win.set_position(LogicalPosition::new(x, y));
        }
    }
    Ok(())
}
