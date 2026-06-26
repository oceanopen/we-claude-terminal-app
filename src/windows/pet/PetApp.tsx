import type { SessionInfo, SessionStatus } from '@src/shared/bindings';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import { EVENT_MONITOR_SESSIONS_CHANGED } from '@src/shared/events';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PetSprite from './components/PetSprite';

// 状态聚合优先级（取所有会话中"最忙"的那个作为桌宠展示态）。
// 数字越小优先级越高；空列表时为 Dead（无活跃会话的休眠态）。
const STATUS_PRIORITY: Record<SessionStatus, number> = {
  Busy: 0,
  Waiting: 1,
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
  return { status: top.status, count: sessions.length };
}

function PetApp() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SessionStatus>('Dead');
  const [count, setCount] = useState(0);

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

  // 鼠标穿透切换：mouseenter 关闭穿透（接收点击），mouseleave 恢复穿透（让下层窗口接收）。
  // 鼠标按下时直接 startDragging（拖动桌宠），避免误触 click。
  const handleMouseEnter = useCallback(() => {
    void commands.setPetClickThrough(false);
  }, []);
  const handleMouseLeave = useCallback(() => {
    void commands.setPetClickThrough(true);
  }, []);
  const handleMouseDown = useCallback(async () => {
    // startDragging 由 mousedown 触发，与 click 区分用：拖动后 mouseup 不会触发 click。
    try {
      await getCurrentWindow().startDragging();
    } catch (e) {
      console.warn('[pet] startDragging failed:', e);
    }
  }, []);

  // 点击桌宠（非拖动）→ 拉起监控窗口。
  const handleClick = useCallback(() => {
    void unwrap(commands.showMonitorWindow()).catch(e =>
      console.warn('[pet] showMonitorWindow failed:', e),
    );
  }, []);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      title={`${t(`pet:tooltip.${status.toLowerCase()}`)}\n${t('pet:hint')}`}
    >
      <PetSprite status={status} count={count} />
    </div>
  );
}

export default PetApp;
