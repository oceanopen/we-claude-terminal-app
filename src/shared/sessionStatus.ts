import type { SessionInfo, SessionStatus } from './bindings';

// 非空闲会话的判定口径 SSOT，供桌宠徽章与监听窗口共用，避免双份维护。
// 白名单而非 `!== 'Idle'` 黑名单：未来新增状态不会被误计为活跃。
export const ACTIVE_STATUSES: ReadonlySet<SessionStatus> = new Set(['Busy', 'Waiting']);

export function isActiveSession(s: SessionInfo): boolean {
  return ACTIVE_STATUSES.has(s.status);
}

export function countActiveSessions(sessions: SessionInfo[]): number {
  return sessions.filter(isActiveSession).length;
}
