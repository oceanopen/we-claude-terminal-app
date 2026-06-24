// 所有 Tauri 事件名的 SSOT。修改时必须同步 src/shared/events.ts（前端镜像）。
// 这些事件名散落在 emit/listen 调用中，typo 不会编译报错，集中常量化降低漂移风险。

/// 配置项变更时广播（ConfigChangedPayload）。订阅方（AppThemeProvider / AppI18nProvider）
/// 与托盘菜单刷新逻辑据此响应配置变化。
pub const EVENT_CONFIG_CHANGED: &str = "config-changed";

/// monitor 窗口会话列表变更时广播（payload = `&[SessionInfo]` 快照）。
/// rescan（fs watcher / 5s 兜底轮询）末尾触发；MonitorApp 据此 setSessions 增量刷新。
pub const EVENT_MONITOR_SESSIONS_CHANGED: &str = "monitor:sessions-changed";
