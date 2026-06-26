// 进程富集：RawSessionFile → SessionInfo。
//
// 通过链式 `ps -p <pid> -o ppid=,comm=` 向上找父进程链，
// 直到匹配到已知终端 comm（iTerm / Terminal / idea / ...），记录 hostPid/hostApp；
// 然后对 hostPid 跑 `ps -p <hostPid> -o tty=` 拿到 /dev/ttysXXX。
//
// 实现上用 std::process::Command 跑 ps，避免引入 nix/libc 依赖。
// 任一 ps 失败走兜底值（Unknown / pid=0 / 空 tty），不阻塞 enrich 主流程。

use std::path::Path;

use crate::sessions::raw::RawSessionFile;
use crate::shared::types::{SessionInfo, SessionStatus, TerminalApp};

/// 调用 `ps -p <pid> -o <field>=`，返回 stdout trim 后的字符串。
/// 失败返回 None。field 形如 "ppid=" / "comm=" / "tty="。
fn ps_field(pid: u32, field: &str) -> Option<String> {
    let out = std::process::Command::new("ps")
        .args(["-p", &pid.to_string(), "-o", field])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// 把 ps 取到的 comm 字符串归一化为 TerminalApp。
/// iTerm 3.x 进程名是 "iTerm2" 或 "iTerm"；macOS 自带 Terminal 进程名是 "Terminal"；
/// IntelliJ 内嵌终端进程名是 "idea"。
fn classify_terminal(comm: &str) -> Option<TerminalApp> {
    // basename：ps -o comm= 给的可能是完整路径或裸名，统一取最后一段。
    let basename = Path::new(comm)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(comm);
    match basename {
        "iTerm" | "iTerm2" => Some(TerminalApp::ITerm2),
        "Terminal" => Some(TerminalApp::Terminal),
        "idea" => Some(TerminalApp::IntelliJ),
        _ => None,
    }
}

/// 从 Claude pid 开始向上爬父进程链，直到找到已知终端。
/// 最多爬 8 层防止异常环；找不到返回 (Unknown, 0)。
fn lookup_host(claude_pid: u32) -> (TerminalApp, u32) {
    let mut pid = claude_pid;
    for _ in 0..8 {
        let Some(ppid_str) = ps_field(pid, "ppid=") else {
            break;
        };
        let Ok(ppid) = ppid_str.parse::<u32>() else {
            break;
        };
        if ppid == 0 || ppid == pid {
            break;
        }
        if let Some(comm) = ps_field(ppid, "comm=")
            && let Some(app) = classify_terminal(&comm)
        {
            return (app, ppid);
        }
        pid = ppid;
    }
    (TerminalApp::Unknown, 0)
}

/// 把 RawSessionFile.status 字符串映射为 SessionStatus。
/// Claude Code 当前已观察到的值："busy" / "waiting" / "idle"。
/// 未识别值兜底为 Idle（宁可误判 idle 也不误判 busy）。
pub fn map_status(raw: &str) -> SessionStatus {
    match raw {
        "busy" => SessionStatus::Busy,
        "waiting" => SessionStatus::Waiting,
        "idle" => SessionStatus::Idle,
        _ => SessionStatus::Idle,
    }
}

/// 把 RawSessionFile 富集为完整 SessionInfo。
/// projectName = basename(cwd)，cwd 异常（如根路径）时 projectName 为空字符串。
pub fn enrich(raw: &RawSessionFile) -> SessionInfo {
    let project_name = Path::new(&raw.cwd)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let (host_app, host_pid) = lookup_host(raw.pid);
    // tty 仅在找到 host_pid 时查询，否则空字符串（Unknown 终端跳转按钮会禁用）。
    let tty = if host_pid > 0 {
        ps_field(host_pid, "tty=").unwrap_or_default()
    } else {
        String::new()
    };

    SessionInfo {
        pid: raw.pid,
        session_id: raw.session_id.clone(),
        cwd: raw.cwd.clone(),
        project_name,
        status: map_status(&raw.status),
        started_at: raw.started_at,
        updated_at: raw.updated_at,
        host_app,
        host_pid,
        tty,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_mapping() {
        assert_eq!(map_status("busy"), SessionStatus::Busy);
        assert_eq!(map_status("waiting"), SessionStatus::Waiting);
        assert_eq!(map_status("idle"), SessionStatus::Idle);
        assert_eq!(map_status("unknown"), SessionStatus::Idle);
        assert_eq!(map_status(""), SessionStatus::Idle);
    }

    #[test]
    fn classify_known_terminals() {
        assert_eq!(classify_terminal("iTerm2"), Some(TerminalApp::ITerm2));
        assert_eq!(classify_terminal("iTerm"), Some(TerminalApp::ITerm2));
        assert_eq!(classify_terminal("Terminal"), Some(TerminalApp::Terminal));
        assert_eq!(classify_terminal("idea"), Some(TerminalApp::IntelliJ));
        assert_eq!(classify_terminal("wezterm"), None);
        assert_eq!(classify_terminal("/Applications/iTerm.app/Contents/MacOS/iTerm2"), Some(TerminalApp::ITerm2));
    }
}
