// Terminal.app AppleScript 跳转。
//
// Terminal.app 只有 window → tab 两层（无 session 概念），匹配条件仅 tty。
// 命中后：set selected tab of w to t; set index of w to 1（把窗口拉到最前）。

use std::process::Command;

use crate::terminal::{NavErr, Target};

const SCRIPT_TEMPLATE: &str = r#"
tell application "Terminal"
    activate
    set targetTTY to {tty}
    set didSelect to false
    repeat with w in windows
        repeat with t in tabs of w
            if tty of t is targetTTY then
                set selected tab of w to t
                set index of w to 1
                set didSelect to true
                exit repeat
            end if
        end repeat
        if didSelect then exit repeat
    end repeat
end tell
"#;

fn applescript_string(s: Option<&str>) -> String {
    match s {
        None => "missing value".to_string(),
        Some(v) => {
            let escaped = v.replace('\\', "\\\\").replace('"', "\\\"");
            format!("\"{}\"", escaped)
        }
    }
}

fn render_script(target: &Target<'_>) -> String {
    SCRIPT_TEMPLATE.replace("{tty}", &applescript_string(target.tty))
}

/// 执行 Terminal.app 跳转。osascript 失败时返回 NavErr::OsaScriptFailed。
/// tty 为 None 时直接返回 OsaScriptFailed（Terminal.app 仅靠 tty 匹配，无 fallback）。
pub fn focus_session(target: &Target<'_>) -> Result<(), NavErr> {
    if target.tty.is_none() {
        return Err(NavErr::OsaScriptFailed {
            stderr: "tty is required for Terminal.app navigation".to_string(),
        });
    }
    let script = render_script(target);
    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(NavErr::OsaScriptFailed { stderr });
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn render_includes_tty() {
        let target = Target {
            tty: Some("/dev/ttys007"),
        };
        let script = render_script(&target);
        assert!(script.contains("\"/dev/ttys007\""));
        assert!(script.contains("set selected tab of w to t"));
        assert!(script.contains("set index of w to 1"));
    }
}
