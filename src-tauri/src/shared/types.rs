// 跨 IPC 边界的共享类型（Rust ↔ TypeScript）。
// 通过 tauri-specta 自动导出到 src/shared/bindings.ts（运行 `pnpm gen:bindings`）。
// 修改本文件后必须重新生成 bindings.ts，否则前后端类型会漂移。

use serde::{Deserialize, Serialize};
use specta::Type;
// Number 用于把 i64 等 BigInt-style 类型在 specta 导出时映射为 TS `number`。
// last_activity 是毫秒时间戳（远小于 2^53），精度安全。
use specta_typescript::Number;

// ============================================================
// ConfigChangedPayload：config-changed 事件
// ============================================================

/// set_config 命令成功后通过 `config-changed` 事件广播给所有窗口的载荷。
/// 订阅方（AppThemeProvider / AppI18nProvider）据此响应配置变化。
#[derive(Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigChangedPayload {
    /// 变更的配置 key（与 src/shared/config.ts 中的 *_KEY 常量对齐）。
    pub key: String,
    /// 新值（配置统一以字符串形式存储，订阅方按 key 自行 decode）。
    pub value: String,
}

// ============================================================
// 终端会话：monitor 窗口卡片数据
// ============================================================

/// 终端会话状态。前端 SessionCard 据此切换状态 Chip 配色与文案。
// 暂无 Rust 命令返回（后端采集未接入），仅经 specta 导出到 bindings.ts 供前端使用。
#[allow(dead_code)]
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize, Type)]
pub enum SessionStatus {
    Running,
    NeedsConfirmation,
    Completed,
}

/// 终端会话快照。MonitorApp 渲染 SessionCard 列表的数据源。
// 暂无 Rust 命令构造（后端采集未接入），仅经 specta 导出到 bindings.ts 供前端使用。
#[allow(dead_code)]
#[derive(Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub session_id: String,
    pub cwd: String,
    pub project_name: String,
    pub title: String,
    pub status: SessionStatus,
    /// 最后活动时间（毫秒时间戳）。前端据此渲染相对时间（刚刚 / N 分钟前）。
    #[specta(type = Number)]
    pub last_activity: i64,
}
