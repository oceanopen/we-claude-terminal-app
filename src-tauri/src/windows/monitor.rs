use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::shared::screen::{
    find_monitor_for_tray, ratio_size, work_area_center, DEFAULT_SIZE, MONITOR_RATIO,
};

// ============================================================
// 会话发现（Task 13）
// ============================================================
//
// 数据源：~/.claude/projects/<project-slug>/<session-uuid>.jsonl
//   - project-slug 是 cwd 的有损 slug（dash 替换不可逆，含 dash 路径会丢信息），
//     因此 cwd 一律从 jsonl 内的事件字段读，不反推 slug。
//   - subagents/ 嵌套子目录里的 jsonl 是子 Agent 转录，不是主会话，扫描时跳过。

/// 老化阈值：mtime 距 now 超过 30min 的会话视为失活，从列表剔除。
const STALENESS_SECS: i64 = 30 * 60;

/// peek_cwd 的扫描行数上限。前几十行内必有首个带 cwd 字段的事件，超出则视为异常文件放弃。
const PEEK_CWD_MAX_LINES: usize = 50;

/// discover 阶段的中间结果：拿到文件 + cwd + mtime，但尚未解析 title/status（Task 14）。
/// path 字段供 Task 14 parse 复用，避免再次按 session_id 反查文件。
#[allow(dead_code)]
pub(crate) struct DiscoveredSession {
    pub session_id: String,
    pub cwd: String,
    /// 毫秒时间戳，与 SessionInfo.last_activity 单位对齐。
    pub mtime: i64,
    pub path: PathBuf,
}

/// `~/.claude/projects`，home_dir 探测失败返回 None。
fn claude_projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

/// UUID v4 风格文件名校验：8-4-4-4-12 共 36 字符的 hex。
/// 项目目录下文件名形如 `<uuid>.jsonl`，非 UUID 命名的（如系统临时文件）会被剔除。
fn is_uuid_like(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() != 36 {
        return false;
    }
    for (i, b) in bytes.iter().enumerate() {
        match i {
            8 | 13 | 18 | 23 => {
                if *b != b'-' {
                    return false;
                }
            }
            _ => {
                if !b.is_ascii_hexdigit() {
                    return false;
                }
            }
        }
    }
    true
}

/// SystemTime → 毫秒时间戳（since UNIX_EPOCH）。系统时钟早于 epoch 时返回 0 兜底。
fn systemtime_to_millis(t: SystemTime) -> i64 {
    t.duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// 逐行读 jsonl，返回首条带非空 `cwd` 字段的事件 cwd 值。
/// 每个真实会话的事件都带 cwd（line 3 起的 user/assistant/system 事件均含此字段），
/// 因此只需扫前几十行即可命中，超出 PEEK_CWD_MAX_LINES 视为异常文件放弃。
fn peek_cwd(path: &Path) -> Option<String> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);
    for line in reader.lines().take(PEEK_CWD_MAX_LINES) {
        let Ok(line) = line else {
            break;
        };
        let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        if let Some(cwd) = obj.get("cwd").and_then(|v| v.as_str()) {
            if !cwd.is_empty() {
                return Some(cwd.to_string());
            }
        }
    }
    None
}

/// 遍历 `~/.claude/projects` 下每个项目子目录的**直接** .jsonl 文件，按 staleness + cwd 命中过滤。
///
/// 流程：
/// 1. 遍历 projects 下每个子目录（项目 slug）；
/// 2. 每个项目目录只取直接 .jsonl 文件（跳过 subagents/ 等嵌套）；
/// 3. 文件名 stem 必须 UUID-like；
/// 4. mtime 距 now 超 STALENESS_SECS 剔除；
/// 5. peek_cwd 读真实 cwd，失败剔除；
/// 6. 任一中间步骤失败 silently skip（容忍单个文件损坏不影响整体）。
pub fn discover_session_files() -> Vec<DiscoveredSession> {
    let Some(projects_dir) = claude_projects_dir() else {
        return vec![];
    };
    let now_ms = systemtime_to_millis(SystemTime::now());
    let staleness_ms = STALENESS_SECS * 1000;

    let mut found = vec![];
    let Ok(proj_entries) = fs::read_dir(&projects_dir) else {
        return vec![];
    };
    for proj_entry in proj_entries.flatten() {
        let proj_dir = proj_entry.path();
        if !proj_dir.is_dir() {
            continue;
        }
        let Ok(sub_entries) = fs::read_dir(&proj_dir) else {
            continue;
        };
        for sub_entry in sub_entries.flatten() {
            let path = sub_entry.path();
            // 跳过 subagents/ 等嵌套目录：只处理直接文件。
            if !path.is_file() {
                continue;
            }
            if path.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                continue;
            }
            let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
                continue;
            };
            if !is_uuid_like(stem) {
                continue;
            }

            let Ok(meta) = fs::metadata(&path) else {
                continue;
            };
            let Ok(mtime) = meta.modified() else {
                continue;
            };
            let mtime_ms = systemtime_to_millis(mtime);
            if now_ms - mtime_ms > staleness_ms {
                continue;
            }

            let Some(cwd) = peek_cwd(&path) else {
                continue;
            };

            found.push(DiscoveredSession {
                session_id: stem.to_string(),
                cwd,
                mtime: mtime_ms,
                path,
            });
        }
    }
    found
}

#[tauri::command]
#[specta::specta]
pub fn show_monitor_window(app: tauri::AppHandle) -> Result<(), String> {
    // 按 tray.rect() 所在屏算尺寸；探测失败用 DEFAULT_SIZE 兜底，后续 set_position 也跳过。
    let monitor = find_monitor_for_tray(&app, "tray");
    let (width, height) = monitor
        .as_ref()
        .map(|m| ratio_size(m, MONITOR_RATIO))
        .unwrap_or(DEFAULT_SIZE);

    let monitor_win = match app.get_webview_window("monitor") {
        Some(w) => {
            // 二次唤起：显式重置尺寸，避免窗口实例首次建好后跨分辨率屏固化。
            let _ = w.set_size(LogicalSize::new(width, height));
            w
        }
        None => {
            let win =
                WebviewWindowBuilder::new(&app, "monitor", WebviewUrl::App("monitor.html".into()))
                    .title("We Claude Terminal Monitor")
                    .inner_size(width, height)
                    // 默认在主屏居中；下方 set_position 修正到 tray 所在屏，探测失败保持主屏。
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

    // 新建和二次唤起都按 tray 所在屏的 work_area 居中；在 show 之前调用，无视觉跳跃。
    if let Some(m) = &monitor {
        let (x, y) = work_area_center(m, width, height);
        let _ = monitor_win.set_position(LogicalPosition::new(x, y));
    }

    let _ = monitor_win.show();
    let _ = monitor_win.unminimize();
    let _ = monitor_win.set_focus();

    Ok(())
}
