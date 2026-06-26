// 反序列化 `~/.claude/sessions/<pid>.json` 为结构化数据。
//
// Claude Code 实际写入的 json 还含 procStart/version/kind/entrypoint 等字段，
// 这些当前业务用不到，不声明避免无谓反序列化开销（serde 默认忽略未知字段）。

use serde::{Deserialize, Serialize};

/// `~/.claude/sessions/<pid>.json` 的反序列化结构。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RawSessionFile {
    /// Claude Code 进程 pid（也是文件名 stem）。
    pub pid: u32,
    /// 会话 ID（uuid）。
    #[serde(rename = "sessionId")]
    pub session_id: String,
    /// 工作目录绝对路径。
    pub cwd: String,
    /// 启动时间（毫秒时间戳）。
    #[serde(rename = "startedAt")]
    pub started_at: i64,
    /// 状态字符串，原始值如 "busy" / "waiting" / "idle"。
    pub status: String,
    /// 最后状态更新时间（毫秒时间戳）。
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

/// 解析 json 字符串为 RawSessionFile。
/// 调用方负责处理 Err（文件损坏 / schema 漂移），上层通常 silently skip。
pub fn parse(content: &str) -> Result<RawSessionFile, serde_json::Error> {
    serde_json::from_str(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    // 真实样例：来自 ~/.claude/sessions/60723.json（本机 2026-06-26 抓取）。
    // 用于回归 Claude Code 写入 schema 漂移时立即报警。
    const SAMPLE: &str = r#"{"pid":60723,"sessionId":"f83d86d1-978e-435f-a88f-a272661f8d89","cwd":"/Users/gaopan/MyFiles/Project/we-health-tick-app","startedAt":1782441061291,"procStart":"Fri Jun 26 02:30:59 2026","version":"2.1.153","peerProtocol":1,"kind":"interactive","entrypoint":"cli","status":"idle","updatedAt":1782441061223}"#;

    #[test]
    fn parses_real_session_file() {
        let s = parse(SAMPLE).expect("real sample must parse");
        assert_eq!(s.pid, 60723);
        assert_eq!(s.session_id, "f83d86d1-978e-435f-a88f-a272661f8d89");
        assert_eq!(s.cwd, "/Users/gaopan/MyFiles/Project/we-health-tick-app");
        assert_eq!(s.started_at, 1782441061291);
        assert_eq!(s.status, "idle");
        assert_eq!(s.updated_at, 1782441061223);
    }

    #[test]
    fn ignores_extra_fields() {
        // peerProtocol / version 等字段当前不声明，serde 默认忽略。
        let s = parse(SAMPLE).unwrap();
        assert_eq!(s.pid, 60723);
    }

    #[test]
    fn rejects_invalid_json() {
        assert!(parse("not json").is_err());
    }
}
