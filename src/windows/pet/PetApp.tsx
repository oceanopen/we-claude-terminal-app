import type { ConfigChangedPayload, SessionInfo, SessionStatus } from '@src/shared/bindings';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import {
  DEFAULT_PET_DRAGGABLE,
  getConfig,
  isYes,
  parseYesNo,
  PET_DRAGGABLE_KEY,
} from '@src/shared/config';
import {
  EVENT_CONFIG_CHANGED,
  EVENT_MONITOR_SESSIONS_CHANGED,
} from '@src/shared/events';
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
  // 桌宠拖拽开关：开启时可拖拽、点击静默；关闭时不可拖拽、点击打开终端监控页。
  const [draggable, setDraggable] = useState(false);

  // 纯函数：从 sessions 快照计算 status + count。PetApp 与 PetTaskApp 共用
  // sessions-changed payload 作为数据源，applySessions 保证两端对同一事件的响应原子化，
  // 不再走 IPC 二次拉取（消除高频 rescan 下的版本错位）。
  const applySessions = useCallback((sessions: SessionInfo[]) => {
    const agg = aggregateStatus(sessions);
    setStatus(agg.status);
    setCount(agg.count);
  }, []);

  // 初次 mount 主动拉一次（与 PetTaskApp 一致）；事件回调直接用 payload 调 applySessions。
  // cleanup 用 .then().catch() 防竞态。
  useEffect(() => {
    unwrap(commands.getMonitorSessions())
      .then(applySessions)
      .catch((e) => {
        console.warn('[pet] load failed', e);
      });
    const unlisten = listen<SessionInfo[]>(EVENT_MONITOR_SESSIONS_CHANGED, (e) => {
      applySessions(e.payload);
    });
    return () => {
      unlisten
        .then(fn => fn())
        .catch(err => console.warn('[pet] unlisten failed:', err));
    };
  }, [applySessions]);

  // count 变化时驱动 pet_task 显隐：count > 0 调 show_pet_task（后端按 pet 可见 && count 裁决），
  // count == 0 调 hide_pet_task。pet_task 显隐主导权在此，后端 rescan 不再自动联动。
  useEffect(() => {
    const cmd = count > 0 ? commands.showPetTask() : commands.hidePetTask();
    unwrap(cmd).catch((e) => {
      console.warn('[pet] pet_task visibility failed', e);
    });
  }, [count]);

  // 拖拽开关：mount 读配置初始化（默认关闭）；监听 config-changed 实时响应托盘菜单切换。
  // 与 AppThemeProvider 的配置实时响应模式一致。
  useEffect(() => {
    getConfig(PET_DRAGGABLE_KEY)
      .then(v => setDraggable(isYes(parseYesNo(v, DEFAULT_PET_DRAGGABLE))))
      .catch((e) => {
        console.warn('[pet] load draggable failed', e);
      });
    const unlisten = listen<ConfigChangedPayload>(EVENT_CONFIG_CHANGED, (e) => {
      if (e.payload.key === PET_DRAGGABLE_KEY) {
        setDraggable(isYes(parseYesNo(e.payload.value, DEFAULT_PET_DRAGGABLE)));
      }
    });
    return () => {
      unlisten
        .then(fn => fn())
        .catch(err => console.warn('[pet] draggable unlisten failed:', err));
    };
  }, []);

  // 鼠标悬停反馈：mouseenter 高亮、mouseleave 恢复（驱动 opacity 过渡）。
  const handleMouseEnter = useCallback(() => {
    setHovered(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);
  // 开启拖拽：鼠标按下进入原生窗口拖拽（startDragging 会吞掉后续 click，故无需特殊处理）。
  // 关闭拖拽：mouseDown 空转，交由 handleClick 打开终端监控页。
  const handleMouseDown = useCallback(async () => {
    if (!draggable) {
      return;
    }
    try {
      await getCurrentWindow().startDragging();
    } catch (e) {
      console.warn('[pet] startDragging failed:', e);
    }
  }, [draggable]);
  // 关闭拖拽模式下点击桌宠打开终端监控页；开启模式下 startDragging 已吞掉 click，兜底再判一次。
  const handleClick = useCallback(async () => {
    if (draggable) {
      return;
    }
    try {
      await unwrap(commands.showMonitorWindow());
    } catch (e) {
      console.warn('[pet] open monitor failed', e);
    }
  }, [draggable]);

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
        // 拖拽态用 grab 提示可拖动，点击态用 pointer 提示可点击打开监控页。
        cursor: draggable ? 'grab' : 'pointer',
        opacity: hovered ? 1 : 0.3,
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <PetSprite status={status} count={count} />
    </div>
  );
}

export default PetApp;
