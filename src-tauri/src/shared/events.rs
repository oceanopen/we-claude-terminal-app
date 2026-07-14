// 所有 Tauri 事件名的 SSOT。修改时必须同步 src/shared/events.ts（前端镜像）。
// 这些事件名散落在 emit/listen 调用中，typo 不会编译报错，集中常量化降低漂移风险。

/// 配置项变更时广播（ConfigChangedPayload）。订阅方（AppThemeProvider / AppI18nProvider）
/// 与托盘菜单刷新逻辑据此响应配置变化。
pub const EVENT_CONFIG_CHANGED: &str = "config-changed";

/// Claude 会话列表变更时广播（payload = `&[ClaudeSessionInfo]` 快照）。
/// rescan（fs watcher / 兜底轮询）末尾触发；ClaudeSessionsPage 据此 setSessions 增量刷新。
pub const EVENT_CLAUDE_SESSIONS_CHANGED: &str = "claude-sessions:changed";

/// 终端跳转失败时广播（payload = `SessionNavFailed`）。
/// navigate_to_claude_session 命令失败时 emit；ClaudeSessionsPage / PetClaudeSessionsTaskApp 据此弹 toast。
pub const EVENT_CLAUDE_SESSION_NAV_FAILED: &str = "claude-sessions:nav-failed";

/// pet_claude_sessions_task 重定位请求（无 payload）。show_pet_claude_sessions_task_window 在 show 后
/// emit_to 给该窗口；PetClaudeSessionsTaskApp 监听后重新测量内容高度并回调 fit_pet_claude_sessions_task
/// 刷新位置。作为统一可复用的"重定位"入口——刷新按钮（经 rescan→内容变→ResizeObserver 间接复用）、
/// 未来 pet 拖动跟随等"尺寸不变却需重定位"的场景均可复用同一事件。
pub const EVENT_PET_CLAUDE_SESSIONS_TASK_REFIT: &str = "pet-claude-sessions-task:refit";
