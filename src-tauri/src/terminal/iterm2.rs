// iTerm2 AppleScript 跳转。
//
// 匹配优先级：
//   1. tty of s = targetTTY     —— 主策略，pid 反查得到的 pts 设备
//   2. textMatches(sessionText, targetCwd)
//   3. textMatches(sessionText, targetHomeCwd)  —— ~/cwd 形式
//   4. textMatches(sessionText, targetProjectName)
//
// 任一命中 → selectSession(w, t, s)；全 miss → select window 1; select tab 1 of window 1。
// sessionText = session.name + session.contents，覆盖 iTerm2 各种命名习惯。

use std::process::Command;

use crate::terminal::{NavErr, Target};

/// 完整 AppleScript 模板。
/// 选择 raw string + format! 而非 handlebars，避免新依赖。
const SCRIPT_TEMPLATE: &str = r#"
on textMatches(haystackText, needleText)
    if needleText is missing value then return false
    if needleText is "" then return false
    return haystackText contains needleText
end textMatches

on selectSession(theWindow, theTab, theSession)
    tell application "iTerm2"
        select theWindow
        select theTab
        select theSession
    end tell
end selectSession

tell application "iTerm2"
    activate
    set targetTTY to {tty}
    set targetCwd to {cwd}
    set targetHomeCwd to {home_cwd}
    set targetProjectName to {project_name}
    set didSelect to false

    repeat with w in windows
        repeat with t in tabs of w
            repeat with s in sessions of t
                set sessionText to ""
                try
                    set sessionText to sessionText & " " & (name of s as text)
                end try
                try
                    set sessionText to sessionText & " " & (contents of s as text)
                end try

                set ttyMatches to false
                if targetTTY is not missing value then
                    try
                        if tty of s is targetTTY then set ttyMatches to true
                    end try
                end if

                if ttyMatches or my textMatches(sessionText, targetCwd) or my textMatches(sessionText, targetHomeCwd) or my textMatches(sessionText, targetProjectName) then
                    my selectSession(w, t, s)
                    set didSelect to true
                    exit repeat
                end if
            end repeat
            if didSelect then exit repeat
        end repeat
        if didSelect then exit repeat
    end repeat

    if didSelect is false then
        select window 1
        select tab 1 of window 1
    end if
end tell
"#;

/// 把字符串字面量转成 AppleScript 字符串字面量（双引号包裹 + 转义）。
/// None 值渲染为 missing value（AppleScript 内置的"无值"常量）。
fn applescript_string(s: Option<&str>) -> String {
    match s {
        None => "missing value".to_string(),
        Some(v) => {
            // AppleScript 转义：双引号和反斜杠。其他字符安全。
            let escaped = v.replace('\\', "\\\\").replace('"', "\\\"");
            format!("\"{}\"", escaped)
        }
    }
}

fn render_script(target: &Target<'_>) -> String {
    SCRIPT_TEMPLATE
        .replace("{tty}", &applescript_string(target.tty))
        .replace("{cwd}", &applescript_string(Some(target.cwd)))
        .replace(
            "{home_cwd}",
            &applescript_string(target.home_cwd),
        )
        .replace(
            "{project_name}",
            &applescript_string(Some(target.project_name)),
        )
}

/// 执行 iTerm2 跳转。osascript 失败时返回 NavErr::OsaScriptFailed（含 stderr）。
pub fn focus_session(target: &Target<'_>) -> Result<(), NavErr> {
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
    fn render_includes_all_targets() {
        let target = Target {
            tty: Some("/dev/ttys004"),
            cwd: "/Users/foo/proj",
            home_cwd: Some("~/proj"),
            project_name: "proj",
        };
        let script = render_script(&target);
        assert!(script.contains("\"/dev/ttys004\""));
        assert!(script.contains("\"/Users/foo/proj\""));
        assert!(script.contains("\"~/proj\""));
        assert!(script.contains("\"proj\""));
        assert!(script.contains("selectSession"));
        assert!(script.contains("textMatches"));
        assert!(script.contains("set didSelect to false"));
    }

    #[test]
    fn none_tty_renders_missing_value() {
        let target = Target {
            tty: None,
            cwd: "/x",
            home_cwd: None,
            project_name: "x",
        };
        let script = render_script(&target);
        assert!(script.contains("set targetTTY to missing value"));
        assert!(script.contains("set targetHomeCwd to missing value"));
    }

    #[test]
    fn escapes_quotes() {
        let target = Target {
            tty: Some("a\"b"),
            cwd: "x",
            home_cwd: None,
            project_name: "x",
        };
        let script = render_script(&target);
        assert!(script.contains("\"a\\\"b\""));
    }
}
