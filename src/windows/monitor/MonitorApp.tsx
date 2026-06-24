import type { SessionInfo } from '@src/shared/bindings';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  CircularProgress,
  Typography,
} from '@mui/material';
import { commands } from '@src/shared/bindings';
import { unwrap } from '@src/shared/commands';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import SessionList from './components/SessionList';

type LoadStatus = 'loading' | 'ready' | 'error';

function MonitorApp() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);

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

  useEffect(() => {
    void load();
  }, [load]);

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
        {status === 'ready' && <SessionList sessions={sessions} />}
      </Box>
    </Box>
  );
}

export default MonitorApp;
