import type { NavErr, SessionInfo } from '@src/shared/bindings';
import { Autorenew as AutorenewIcon } from '@mui/icons-material';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Snackbar,
  Typography,
} from '@mui/material';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import {
  EVENT_MONITOR_SESSIONS_CHANGED,
  EVENT_SESSION_NAV_FAILED,
} from '@src/shared/events';
import { isActiveSession, isFreeSession } from '@src/shared/sessionStatus';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SessionList from './components/SessionList';

type LoadStatus = 'loading' | 'ready' | 'error';

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

function MonitorApp() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const data = await unwrap(commands.getMonitorSessions());
      setSessions(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  const handleOpenTerminal = useCallback(async (pid: number) => {
    // navigate_to_session 成功路径返回 Ok(())；失败时后端 emit session-navigation-failed，
    // 由下面的 listen 统一处理 toast（不在这里 catch），命令调用本身静默。
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

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const unlistenPromise = listen<SessionInfo[]>(
      EVENT_MONITOR_SESSIONS_CHANGED,
      (e) => {
        setSessions(e.payload);
      },
    );
    return () => {
      unlistenPromise
        .then(fn => fn())
        .catch((err: unknown) => {
          console.warn('[monitor:sessions-changed] unlisten failed (possible Tauri event race):', err);
        });
    };
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<NavErr>(EVENT_SESSION_NAV_FAILED, (e) => {
      const { key, opts } = navErrToToastKey(e.payload);
      setToast(t(key, opts));
    });
    return () => {
      unlistenPromise
        .then(fn => fn())
        .catch((err: unknown) => {
          console.warn('[monitor:session-navigation-failed] unlisten failed:', err);
        });
    };
  }, [t]);

  // 监听窗口展示活跃会话（Busy+Waiting）+ 空闲会话（Idle）。
  // sessions 仍保留全量（事件订阅原始 payload），activeSessions/freeSessions 作为派生值传入 SessionList。
  const activeSessions = sessions.filter(isActiveSession);
  const freeSessions = sessions.filter(isFreeSession);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box
        sx={{
          p: 2,
          borderBottom: 1,
          borderColor: 'divider',
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {t('monitor:summary', { total: sessions.length, active: activeSessions.length })}
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
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {status === 'loading' && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
            }}
          >
            <CircularProgress />
          </Box>
        )}
        {status === 'error' && (
          <Box sx={{ p: 2 }}>
            <Alert
              severity="error"
              action={(
                <Button color="inherit" size="small" onClick={load}>
                  {t('monitor:error.retry')}
                </Button>
              )}
            >
              <AlertTitle>{t('monitor:error.title')}</AlertTitle>
              {t('monitor:error.desc')}
            </Alert>
          </Box>
        )}
        {status === 'ready' && (
          <SessionList
            activeSessions={activeSessions}
            freeSessions={freeSessions}
            onOpenTerminal={handleOpenTerminal}
          />
        )}
      </Box>
      <Snackbar
        open={toast !== null}
        message={toast ?? ''}
        onClose={() => setToast(null)}
        autoHideDuration={4000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  );
}

export default MonitorApp;
