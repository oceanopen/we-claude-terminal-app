import type { NavErr, SessionInfo, SessionStatus } from '@src/shared/bindings';
import { Autorenew as AutorenewIcon } from '@mui/icons-material';
import { Box, IconButton, List, Paper, Snackbar, Typography } from '@mui/material';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import {
  EVENT_MONITOR_SESSIONS_CHANGED,
  EVENT_SESSION_NAV_FAILED,
} from '@src/shared/events';
import { isActiveSession } from '@src/shared/sessionStatus';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PanelEmptyState from './components/PanelEmptyState';
import SessionItem from './components/SessionItem';

// 排序优先级与 SessionList 对齐：Waiting 优先于 Busy，同状态按 updatedAt 倒序。
const STATUS_PRIORITY: Record<SessionStatus, number> = {
  Waiting: 0,
  Busy: 1,
  Idle: 2,
  Dead: 3,
};

function sortSessions(sessions: SessionInfo[]): SessionInfo[] {
  return [...sessions].sort((a, b) => {
    const pri = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (pri !== 0) {
      return pri;
    }
    return b.updatedAt - a.updatedAt;
  });
}

// 与 MonitorApp 共用的 NavErr → toast i18n key 映射（保持两端错误文案一致）。
function navErrToToastKey(err: NavErr): { key: string; opts?: Record<string, unknown> } {
  switch (err.kind) {
    case 'unsupportedHostApp':
      return { key: 'monitor:toast.unsupportedHostApp' };
    case 'osaScriptFailed':
      return { key: 'monitor:toast.osaScriptFailed', opts: { stderr: err.stderr } };
    case 'sessionNotFound':
      return { key: 'monitor:toast.sessionNotFound' };
    case 'io':
      return { key: 'monitor:toast.io', opts: { message: err.message } };
  }
}

// 纯渲染组件：会话列表 + nav 失败 toast。窗口显隐由 pet 前端基于 count 驱动（show_pet_task / hide_pet_task）。
function PetTaskApp() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 初次拉取：失败静默（列表为空时自然展示空状态，不阻塞面板渲染）。
  useEffect(() => {
    unwrap(commands.getMonitorSessions())
      .then(setSessions)
      .catch((e) => {
        console.warn('[pet-task] load failed', e);
      });
  }, []);

  // 订阅会话变更（fs watcher 1s 去抖 + 兜底轮询）：payload 全量快照直接替换，
  // 实现 count 与状态文案的实时刷新。
  useEffect(() => {
    const unlisten = listen<SessionInfo[]>(EVENT_MONITOR_SESSIONS_CHANGED, (e) => {
      setSessions(e.payload);
    });
    return () => {
      unlisten
        .then(fn => fn())
        .catch((err: unknown) => {
          console.warn('[pet-task:sessions-changed] unlisten failed:', err);
        });
    };
  }, []);

  // 订阅跳转失败 → toast（文案与 MonitorApp 一致）。
  useEffect(() => {
    const unlisten = listen<NavErr>(EVENT_SESSION_NAV_FAILED, (e) => {
      const { key, opts } = navErrToToastKey(e.payload);
      setToast(t(key, opts));
    });
    return () => {
      unlisten
        .then(fn => fn())
        .catch((err: unknown) => {
          console.warn('[pet-task:nav-failed] unlisten failed:', err);
        });
    };
  }, [t]);

  // 点击列表项：navigateToSession 失败走 session-navigation-failed 事件，此处不 catch。
  // 窗口显隐由 pet 前端基于 count 驱动（调 show_pet_task / hide_pet_task），前端点击后不主动 hide。
  const handleOpenTerminal = useCallback(async (pid: number) => {
    await commands.navigateToSession(pid);
  }, []);

  // 手动刷新：触发后端 rescan，emit sessions-changed 后订阅自动更新列表与汇总。
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await unwrap(commands.refreshSessions());
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    setHovered(true);
  }, []);
  const handleMouseLeave = useCallback(() => {
    setHovered(false);
  }, []);

  // 动态高度：ResizeObserver 监听 Paper 实际内容高度变化（会话增减 / 空态切换），
  // rAF 合并同帧多次回调，调 fit_pet_task 让后端 set_size + 重新定位（保持与 pet 中心对齐）。
  // observe 后异步触发首回调，等价于 mount 即 fit，覆盖 show 时用的默认高度。
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    let raf = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const height = root.offsetHeight;
        unwrap(commands.fitPetTask(height)).catch((e) => {
          console.warn('[pet-task] fitPetTask failed', e);
        });
      });
    });
    observer.observe(root);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, []);

  // 仅展示活跃会话（Busy+Waiting），数量与桌宠徽章一致。
  const activeSessions = sortSessions(sessions.filter(isActiveSession));

  return (
    <Paper
      ref={rootRef}
      elevation={3}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      sx={{
        width: 280,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 2,
        opacity: hovered ? 1 : 0.3,
        transition: 'opacity 0.2s',
      }}
    >
      <Box
        sx={{
          px: 1.5,
          py: 1,
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t('pet:task.summary', { total: sessions.length, active: activeSessions.length })}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <IconButton size="small" onClick={handleRefresh} disabled={refreshing} aria-label="refresh">
          <AutorenewIcon
            sx={{
              'animation': refreshing ? 'spin 0.8s linear infinite' : undefined,
              '@keyframes spin': {
                from: { transform: 'rotate(0deg)' },
                to: { transform: 'rotate(360deg)' },
              },
            }}
          />
        </IconButton>
      </Box>
      {activeSessions.length === 0
        ? (
            <PanelEmptyState />
          )
        : (
            <List sx={{ flex: 1, overflow: 'auto', p: 0.5 }}>
              {activeSessions.map(s => (
                <SessionItem key={s.pid} session={s} onClick={handleOpenTerminal} />
              ))}
            </List>
          )}
      <Snackbar
        open={toast !== null}
        message={toast ?? ''}
        onClose={() => setToast(null)}
        autoHideDuration={4000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Paper>
  );
}

export default PetTaskApp;
