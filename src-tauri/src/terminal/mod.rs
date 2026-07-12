// terminal 域：跳转到宿主终端对应会话。
//
// 子模块按终端类型拆分：
//   iterm2       —— iTerm2.app AppleScript（tty 精确匹配）
//   terminal_app —— Terminal.app AppleScript（tty 精确匹配）
//
// dispatch 按 host_app 选择对应实现；Unknown 直接返回 UnsupportedHostApp。
// 未来扩展 VSCode / IntelliJ 内嵌终端只需在 terminal/ 下加文件并在 dispatch 加分支。

pub mod iterm2;
pub mod terminal_app;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::shared::types::TerminalApp;

/// 跳转目标。仅靠 tty 精确匹配会话身份。
#[derive(Clone, Debug)]
pub struct Target<'a> {
    pub tty: Option<&'a str>,
}

/// 跳转失败原因。对应前端 navigation-failed toast 文案细分。
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum NavErr {
    /// 宿主终端未识别（如 VSCode 内嵌 / Wezterm 等）。
    UnsupportedHostApp,
    /// osascript 执行失败（exit code 非零）。
    OsaScriptFailed { stderr: String },
    /// ClaudeSessionStore 找不到对应 pid 的会话（可能刚过期）。
    SessionNotFound,
    /// 其他 IO 错误。
    Io { message: String },
}

impl From<std::io::Error> for NavErr {
    fn from(e: std::io::Error) -> Self {
        NavErr::Io {
            message: e.to_string(),
        }
    }
}

/// 按 host_app 分发到对应终端跳转实现。
/// Unknown 直接返回 UnsupportedHostApp（不尝试 osascript，避免误调）。
pub fn dispatch(host_app: TerminalApp, target: &Target<'_>) -> Result<(), NavErr> {
    match host_app {
        TerminalApp::ITerm2 => iterm2::focus_session(target),
        TerminalApp::Terminal => terminal_app::focus_session(target),
        TerminalApp::IntelliJ | TerminalApp::Unknown => Err(NavErr::UnsupportedHostApp),
    }
}
