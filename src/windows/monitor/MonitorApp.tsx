import type { SessionInfo } from '@src/shared/bindings';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Snackbar,
  Typography,
} from '@mui/material';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import { EVENT_MONITOR_SESSIONS_CHANGED } from '@src/shared/events';
import { listen } from '@tauri-apps/api/event';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SessionList from './components/SessionList';

type LoadStatus = 'loading' | 'ready' | 'error';

function MonitorApp() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [toast, setToast] = useState<string | null>(null);

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

  const handleOpenTerminal = useCallback(async (sessionId: string) => {
    // unwrap 在 error 时 throw r.error：任务 22 后端按 cfg!(target_os) 返回 OS 标识字符串
    // （如 'macOS'），catch 拿到后用 toast.unsupported + {{os}} 插值生成最终文案。
    try {
      await unwrap(commands.openTerminal(sessionId));
    } catch (e) {
      setToast(t('terminal:toast.unsupported', { os: String(e) }));
    }
  }, [t]);

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

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {t('terminal:title')}
        </Typography>
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
                  {t('terminal:error.retry')}
                </Button>
              )}
            >
              <AlertTitle>{t('terminal:error.title')}</AlertTitle>
              {t('terminal:error.desc')}
            </Alert>
          </Box>
        )}
        {status === 'ready' && <SessionList sessions={sessions} onOpenTerminal={handleOpenTerminal} />}
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
