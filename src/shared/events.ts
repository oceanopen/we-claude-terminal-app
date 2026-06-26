// 所有 Tauri 事件名的 SSOT。修改时必须同步 src-tauri/src/shared/events.rs（后端镜像）。
// 与后端 const EVENT_XXX 一一对应；specta 不自动导出 const &str，走双份维护。

export const EVENT_CONFIG_CHANGED = 'config-changed';

export const EVENT_MONITOR_SESSIONS_CHANGED = 'monitor:sessions-changed';

export const EVENT_SESSION_NAV_FAILED = 'monitor:session-navigation-failed';
