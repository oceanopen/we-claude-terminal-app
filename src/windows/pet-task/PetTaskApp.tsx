import type { NavErr, SessionInfo, SessionStatus } from '@src/shared/bindings';
import { Box, List, Paper, Snackbar, Typography } from '@mui/material';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import {
  EVENT_MONITOR_SESSIONS_CHANGED,
  EVENT_SESSION_NAV_FAILED,
} from '@src/shared/events';
import { isActiveSession } from '@src/shared/sessionStatus';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useState } from 'react';
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
      return { key: 'terminal:toast.unsupportedHostApp' };
    case 'osaScriptFailed':
      return { key: 'terminal:toast.osaScriptFailed', opts: { stderr: err.stderr } };
    case 'sessionNotFound':
      return { key: 'terminal:toast.sessionNotFound' };
    case 'io':
      return { key: 'terminal:toast.io', opts: { message: err.message } };
  }
}

// 纯渲染组件：会话列表 + nav 失败 toast。窗口显隐由 pet 前端基于 count 驱动（show_pet_task / hide_pet_task）。
function PetTaskApp() {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // 初次拉取：失败静默（列表为空时自然展示空状态，不阻塞面板渲染）。
  useEffect(() => {
    unwrap(commands.getMonitorSessions())
      .then(setSessions)
      .catch((e) => {
        console.warn('[pet-task] load failed', e);
      });
  }, []);

  // 订阅会话变更（fs watcher 1s 去抖 + 5s 兜底轮询）：payload 全量快照直接替换，
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

  // 仅展示活跃会话（Busy+Waiting），数量与桌宠徽章一致。
  const activeSessions = sortSessions(sessions.filter(isActiveSession));

  return (
    <Paper
      elevation={3}
      sx={{
        width: 280,
        maxHeight: 340,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 2,
      }}
    >
      <Box sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {t('pet:panel.title')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('pet:panel.count', { count: activeSessions.length })}
        </Typography>
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
