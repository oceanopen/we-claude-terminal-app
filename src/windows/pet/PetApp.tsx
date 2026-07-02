import type { SessionInfo, SessionStatus } from '@src/shared/bindings';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import { EVENT_MONITOR_SESSIONS_CHANGED } from '@src/shared/events';
import { countActiveSessions } from '@src/shared/sessionStatus';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useState } from 'react';
import PetSprite from './components/PetSprite';

// 状态聚合优先级（取所有会话中"最需关注"的那个作为桌宠展示态：Waiting 优先于 Busy）。
// 数字越小优先级越高；空列表时为 Dead（无活跃会话的休眠态）。
const STATUS_PRIORITY: Record<SessionStatus, number> = {
  Waiting: 0,
  Busy: 1,
  Idle: 2,
  Dead: 3,
};

function aggregateStatus(sessions: SessionInfo[]): { status: SessionStatus; count: number } {
  if (sessions.length === 0) {
    return { status: 'Dead', count: 0 };
  }
  const top = [...sessions].sort(
    (a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status],
  )[0];
  // 数量口径：仅统计非空闲会话（Busy+Waiting）。top.status 仍看全部会话，保证全部空闲时显示 Idle 表情。
  return { status: top.status, count: countActiveSessions(sessions) };
}

function PetApp() {
  const [status, setStatus] = useState<SessionStatus>('Dead');
  const [count, setCount] = useState(0);
  const [hovered, setHovered] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const sessions = await unwrap(commands.getMonitorSessions());
      const agg = aggregateStatus(sessions);
      setStatus(agg.status);
      setCount(agg.count);
    } catch (e) {
      console.warn('[pet] refresh failed', e);
    }
  }, []);

  // 拉初始数据 + 订阅 sessions-changed（与 MonitorApp 同模式，cleanup 用 .then().catch() 防竞态）。
  useEffect(() => {
    void refresh();
    const unlisten = listen<SessionInfo[]>(EVENT_MONITOR_SESSIONS_CHANGED, () => {
      void refresh();
    });
    return () => {
      unlisten
        .then(fn => fn())
        .catch(err => console.warn('[pet] unlisten failed:', err));
    };
  }, [refresh]);

  // 鼠标悬停反馈：mouseenter 高亮、mouseleave 恢复（驱动 opacity 过渡）。
  // 鼠标按下时 startDragging 拖动桌宠（不再绑定 click，避免与拖拽冲突）。
  const handleMouseEnter = useCallback(() => {
    setHovered(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);
  const handleMouseDown = useCallback(async () => {
    try {
      await getCurrentWindow().startDragging();
    } catch (e) {
      console.warn('[pet] startDragging failed:', e);
    }
  }, []);

  return (
    <div
      className="pet-surface"
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        opacity: hovered ? 1 : 0.3,
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
    >
      <PetSprite status={status} count={count} />
    </div>
  );
}

export default PetApp;
