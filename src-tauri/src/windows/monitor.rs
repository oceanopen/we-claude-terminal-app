use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use notify::RecursiveMode;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::shared::screen::{
    find_monitor_for_tray, ratio_size, work_area_center, DEFAULT_SIZE, MONITOR_RATIO,
};
use crate::shared::state::monitor::{SessionStore, write_sessions};
use crate::shared::types::{SessionInfo, SessionStatus};

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

/// title 截断长度（字符数，按 Unicode code point 计）。任务描述指定 60 字符。
const TITLE_MAX_CHARS: usize = 60;

/// status 判定的"最近活动"窗口：last_event 距 now 在此秒数内视为 Running，否则 Completed。
const RUNNING_RECENT_SECS: i64 = 30;

/// discover 阶段的中间结果：拿到 session_id + cwd + 文件路径，但尚未解析 title/status（Task 14）。
/// path 字段供 Task 14 parse 复用，避免再次按 session_id 反查文件。
/// 注：mtime 不外露——staleness 过滤在 discover 内部用局部变量完成，外部消费 SessionInfo.last_activity 即可。
pub(crate) struct DiscoveredSession {
    pub session_id: String,
    pub cwd: String,
    pub path: PathBuf,
}

/// parse_session 的结果：title/status/last_event_ms。
/// last_event_ms 暴露给 Task 17 rescan 组装 SessionInfo.last_activity，避免再回退用文件 mtime。
pub(crate) struct ParsedSession {
    pub title: String,
    pub status: SessionStatus,
    /// 最后一条 user/assistant 事件的毫秒时间戳。
    pub last_event_ms: i64,
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
                path,
            });
        }
    }
    found
}

// ============================================================
// 会话解析（Task 14）
// ============================================================
//
// 单遍扫描 jsonl 同时完成：title 提取 / pending tool_use 配对 / last_event 跟踪。
// status 优先级：pending tool_use 非空 → NeedsConfirmation；否则 last_event 距 now
// 在 RUNNING_RECENT_SECS 内 → Running；否则 Completed。

/// 取 user 事件的可用文本：`message.content` 为字符串时直接返回；
/// 为数组时取首个 `type=="text"` block 的 text。其他形态返回 None。
/// 函数本身只描述「如何从单个事件取文本」；首条/末条语义由调用方决定
/// （parse_session 采用覆盖式赋值，扫描结束后自然得到最后一条 user text）。
/// 注意：按用户决策不过滤 slash command 噪声（如 `<command-name>...`）。
fn extract_latest_user_text(obj: &serde_json::Value) -> Option<String> {
    let content = obj.get("message")?.get("content")?;
    if let Some(s) = content.as_str() {
        return if s.is_empty() { None } else { Some(s.to_string()) };
    }
    let blocks = content.as_array()?;
    for b in blocks {
        if b.get("type").and_then(|v| v.as_str()) == Some("text") {
            if let Some(s) = b.get("text").and_then(|v| v.as_str()) {
                if !s.is_empty() {
                    return Some(s.to_string());
                }
            }
        }
    }
    None
}

/// 按 Unicode code point 截断，避免非 ASCII 字符（如中文）在 UTF-8 字节边界中间切片导致 panic。
fn truncate_chars(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let end = s
        .char_indices()
        .nth(max)
        .map(|(idx, _)| idx)
        .unwrap_or(s.len());
    s[..end].to_string()
}

/// 解析 ISO 8601 / RFC 3339 时间戳（如 `2026-06-23T09:18:24.791Z`）为毫秒。
/// chrono::DateTime::parse_from_rfc3339 接受带 offsets 的变体；纯 Z 后缀也覆盖。
fn parse_iso8601_to_millis(s: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.timestamp_millis())
}

/// 解析单个会话 jsonl：提取 title、计算 status、跟踪 last_event_ms。
///
/// 扫描规则：
/// - title：覆盖式取每条 `type=="user"` 事件经 `extract_latest_user_text` 提取的文本（截断到
///   TITLE_MAX_CHARS）；扫描结束后 title 自然为最后一条匹配的 user text；整文件无匹配则为空字符串。
/// - status：HashSet 收集 assistant 事件的 tool_use.id，遇到 user 事件的 tool_result.tool_use_id
///   则移除。末尾 set 非空 → NeedsConfirmation；否则比较 last_event_ms 与 now。
/// - last_event_ms：所有 user/assistant 事件 timestamp 的最大值；无任何时间戳则为 0。
///
/// 任一行解析失败 silently skip；文件打不开 / 全部行损坏返回 None。
pub fn parse_session(path: &Path) -> Option<ParsedSession> {
    let file = File::open(path).ok()?;
    let reader = BufReader::new(file);

    let mut title: Option<String> = None;
    let mut pending_tool_use: HashSet<String> = HashSet::new();
    let mut last_event_ms: i64 = 0;

    for line in reader.lines() {
        let Ok(line) = line else {
            break;
        };
        let Ok(obj) = serde_json::from_str::<serde_json::Value>(&line) else {
            continue;
        };
        let Some(t) = obj.get("type").and_then(|v| v.as_str()) else {
            continue;
        };

        // title：覆盖式赋值，扫描结束后 title 为最后一条 user text。
        if t == "user" {
            if let Some(text) = extract_latest_user_text(&obj) {
                title = Some(truncate_chars(&text, TITLE_MAX_CHARS));
            }
        }

        // 时间戳：仅 user/assistant 事件携带 timestamp。
        if (t == "user" || t == "assistant")
            && let Some(ts) = obj.get("timestamp").and_then(|v| v.as_str())
            && let Some(ms) = parse_iso8601_to_millis(ts)
        {
            last_event_ms = ms;
        }

        // pending tool_use 配对。
        if t == "assistant" {
            if let Some(blocks) = obj
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())
            {
                for b in blocks {
                    if b.get("type").and_then(|v| v.as_str()) == Some("tool_use")
                        && let Some(id) = b.get("id").and_then(|v| v.as_str())
                    {
                        pending_tool_use.insert(id.to_string());
                    }
                }
            }
        } else if t == "user" {
            if let Some(blocks) = obj
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_array())
            {
                for b in blocks {
                    if b.get("type").and_then(|v| v.as_str()) == Some("tool_result")
                        && let Some(id) = b.get("tool_use_id").and_then(|v| v.as_str())
                    {
                        pending_tool_use.remove(id);
                    }
                }
            }
        }
    }

    let now_ms = systemtime_to_millis(SystemTime::now());
    let status = if !pending_tool_use.is_empty() {
        SessionStatus::NeedsConfirmation
    } else if now_ms - last_event_ms <= RUNNING_RECENT_SECS * 1000 {
        SessionStatus::Running
    } else {
        SessionStatus::Completed
    };

    Some(ParsedSession {
        title: title.unwrap_or_default(),
        status,
        last_event_ms,
    })
}

// ============================================================
// 全量重扫
// ============================================================

/// 仅输出数量日志：调用方（fs watcher / 周期轮询）会高频触发，详情日志会刷屏。
pub fn rescan(app: &AppHandle) {
    let discovered = discover_session_files();
    let sessions: Vec<SessionInfo> = discovered
        .iter()
        .filter_map(|d| {
            let parsed = parse_session(&d.path)?;
            let project_name = Path::new(&d.cwd)
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string();
            Some(SessionInfo {
                session_id: d.session_id.clone(),
                cwd: d.cwd.clone(),
                project_name,
                title: parsed.title,
                status: parsed.status,
                last_activity: parsed.last_event_ms,
            })
        })
        .collect();

    let count = sessions.len();
    let store = app.state::<SessionStore>();
    write_sessions(&store, sessions);

    log::info!("[monitor] rescan: {} session(s)", count);
}

// ============================================================
// 文件系统监听（Task 18）
// ============================================================
//
// notify + notify-debouncer-mini 监听 ~/.claude/projects/ 递归变更，
// 每 WATCH_DEBOUNCE_MS 去抖窗口合并 burst 后触发一次 rescan。
// 独立 OS 线程持有 debouncer + 接收 channel：
//   - mini debouncer 内部走 std::sync::mpsc，不适合塞进 async 任务；
//   - rescan 是 sync 阻塞 IO，独立线程避免占用 async runtime worker；
//   - 任一环节失败 silently warn 后线程退出——Task 19 的 5s 兜底轮询会接管，
//     watcher 仅是即时性优化项，失败不影响功能正确性。

/// 去抖窗口：mini debouncer 在此窗口内对同一文件的多次事件合并为一次。
/// 1s 平衡响应性与抗抖动（单 turn 内 fsevents burst 合并为一次 rescan）。
const WATCH_DEBOUNCE_MS: u64 = 1000;

/// 启动 fs watcher 后台线程。setup 末尾调用一次，线程生命周期与进程一致。
///
/// 失败模式（均 silently warn 后线程退出，Task 19 兜底轮询接管）：
/// - home_dir 探测失败 → claude_projects_dir 返回 None
/// - debouncer 创建失败（理论上极少，notify backend 初始化出错）
/// - watch() 失败（路径不存在 / 权限不足）
pub fn start_watcher(app: AppHandle) {
    std::thread::spawn(move || {
        let (tx, rx) = std::sync::mpsc::channel();
        let mut debouncer = match notify_debouncer_mini::new_debouncer(
            Duration::from_millis(WATCH_DEBOUNCE_MS),
            tx,
        ) {
            Ok(d) => d,
            Err(e) => {
                log::warn!("[monitor] watcher init failed: {}", e);
                return;
            }
        };

        let Some(dir) = claude_projects_dir() else {
            log::warn!("[monitor] watcher: home_dir not available");
            return;
        };
        if let Err(e) = debouncer.watcher().watch(&dir, RecursiveMode::Recursive) {
            log::warn!(
                "[monitor] watcher.watch failed on {}: {}",
                dir.display(),
                e
            );
            return;
        }

        log::info!("[monitor] watcher started on {}", dir.display());

        // 每个去抖批次触发一次 rescan。rescan 内部自带 jsonl/staleness 过滤，
        // 末尾输出 `[monitor] rescan: N session(s)` 数量日志；watcher 不额外加日志避免刷屏。
        // rx 返回 Err 表示 debouncer 已 drop（仅应用退出时发生），线程自然终止。
        while rx.recv().is_ok() {
            rescan(&app);
        }
    });
}

#[tauri::command]
#[specta::specta]
pub fn get_monitor_sessions(
    state: State<'_, SessionStore>,
) -> Result<Vec<SessionInfo>, String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    Ok(map.values().cloned().collect())
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
