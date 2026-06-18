use tauri::{AppHandle, LogicalPosition, Monitor, Position};

/// 默认/回退窗口尺寸（逻辑像素）。
pub const DEFAULT_SIZE: (f64, f64) = (800.0, 600.0);

/// monitor 窗口占目标屏的比例。
const MONITOR_RATIO: f64 = 0.8;

/// 取鼠标当前所在显示器，回退到主屏幕；全部失败时返回 None。
pub fn cursor_monitor(app: &AppHandle) -> Option<Monitor> {
    app.cursor_position()
        .ok()
        .and_then(|pos| app.monitor_from_point(pos.x, pos.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
}

/// 在目标屏的 work_area（扣除任务栏/Dock）内按窗口尺寸算居中逻辑坐标，
/// 并用 max(0) 防止窗口大于 work_area 时偏移跑出可用区域。
pub fn work_area_center(monitor: &Monitor, width: f64, height: f64) -> (f64, f64) {
    let sf = monitor.scale_factor();
    let wa = monitor.work_area();
    let wa_x = wa.position.x as f64 / sf;
    let wa_y = wa.position.y as f64 / sf;
    let wa_w = wa.size.width as f64 / sf;
    let wa_h = wa.size.height as f64 / sf;
    let x = wa_x + ((wa_w - width) / 2.0).max(0.0);
    let y = wa_y + ((wa_h - height) / 2.0).max(0.0);
    (x, y)
}

/// 按比例算显示器逻辑像素尺寸。
pub fn monitor_logical_size(monitor: &Monitor, ratio: f64) -> (f64, f64) {
    let sf = monitor.scale_factor();
    let size = monitor.size();
    (
        size.width as f64 / sf * ratio,
        size.height as f64 / sf * ratio,
    )
}

/// 取 monitor 窗口的合适尺寸（按目标屏比例，探测失败用 DEFAULT_SIZE）。
pub fn monitor_window_size(app: &AppHandle) -> (f64, f64) {
    cursor_monitor(app)
        .map(|m| monitor_logical_size(&m, MONITOR_RATIO))
        .unwrap_or(DEFAULT_SIZE)
}

/// 把窗口定位到鼠标所在屏的 work_area 居中。
/// 用窗口自身 inner_size 算偏移，所以新建/二次唤起可共用此函数。
/// 探测失败或拿不到窗口尺寸时静默不动（保留调用方设定的初始位置）。
pub fn reposition_to_cursor(window: &tauri::WebviewWindow, app: &AppHandle) {
    let Some(monitor) = cursor_monitor(app) else {
        return;
    };
    let Ok(size) = window.inner_size() else {
        return;
    };
    let sf = monitor.scale_factor();
    let w = size.width as f64 / sf;
    let h = size.height as f64 / sf;
    let (x, y) = work_area_center(&monitor, w, h);
    let _ = window.set_position(Position::Logical(LogicalPosition::new(x, y)));
}
