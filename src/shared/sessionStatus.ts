import type { SessionInfo, SessionStatus } from './bindings';

// 活跃会话判定口径 SSOT，用于桌宠徽章计数（Busy+Waiting）。
// 白名单而非 `!== 'Idle'` 黑名单：未来新增状态不会被误计为活跃。
export const ACTIVE_STATUSES: ReadonlySet<SessionStatus> = new Set(['Busy', 'Waiting']);

export function isActiveSession(s: SessionInfo): boolean {
  return ACTIVE_STATUSES.has(s.status);
}

export function countActiveSessions(sessions: SessionInfo[]): number {
  return sessions.filter(isActiveSession).length;
}

// 空闲会话判定口径 SSOT，用于 monitor 窗口列表展示与计数（Idle）。
// 与 ACTIVE_STATUSES 分离：列表含 Idle 不应让桌宠徽章也 +1，两者口径独立避免连锁漂移。
export const FREE_STATUSES: ReadonlySet<SessionStatus> = new Set(['Idle']);

export function isFreeSession(s: SessionInfo): boolean {
  return FREE_STATUSES.has(s.status);
}

export function countFreeSessions(sessions: SessionInfo[]): number {
  return sessions.filter(isFreeSession).length;
}
