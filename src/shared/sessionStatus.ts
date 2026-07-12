import type { ClaudeSessionInfo, ClaudeSessionStatus } from './bindings';

// 状态色规范 SSOT
// Dead 用深灰而非警示红：无会话休眠非错误，比 Idle 深一档区分。
export const STATUS_COLOR: Record<ClaudeSessionStatus, string> = {
  Busy: '#4caf50', // success 绿（工作中）
  Waiting: '#ff9800', // warning 橙（提醒用户）
  Idle: '#9e9e9e', // 灰（空闲）
  Dead: '#616161', // 深灰（休眠）
};

// 活跃会话判定口径 SSOT，用于桌宠徽章计数（Busy+Waiting）。
// 白名单而非 `!== 'Idle'` 黑名单：未来新增状态不会被误计为活跃。
export const ACTIVE_STATUSES: ReadonlySet<ClaudeSessionStatus> = new Set(['Busy', 'Waiting']);

export function isActiveClaudeSession(s: ClaudeSessionInfo): boolean {
  return ACTIVE_STATUSES.has(s.status);
}

export function countActiveClaudeSessions(sessions: ClaudeSessionInfo[]): number {
  return sessions.filter(isActiveClaudeSession).length;
}

// 空闲会话判定口径 SSOT，用于 claudeSessions 页面列表展示与计数（Idle）。
// 与 ACTIVE_STATUSES 分离：列表含 Idle 不应让桌宠徽章也 +1，两者口径独立避免连锁漂移。
export const FREE_STATUSES: ReadonlySet<ClaudeSessionStatus> = new Set(['Idle']);

export function isFreeClaudeSession(s: ClaudeSessionInfo): boolean {
  return FREE_STATUSES.has(s.status);
}

export function countFreeClaudeSessions(sessions: ClaudeSessionInfo[]): number {
  return sessions.filter(isFreeClaudeSession).length;
}
