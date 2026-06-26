import type { SessionInfo, SessionStatus, TerminalApp } from '@src/shared/bindings';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  CardHeader,
  Chip,
  Divider,
  Typography,
} from '@mui/material';
import { useTranslation } from 'react-i18next';

const chipColor: Record<SessionStatus, 'warning' | 'info' | 'default' | 'error'> = {
  Busy: 'warning',
  Waiting: 'info',
  Idle: 'default',
  Dead: 'error',
};

const statusI18nKey: Record<SessionStatus, string> = {
  Busy: 'terminal:status.busy',
  Waiting: 'terminal:status.waiting',
  Idle: 'terminal:status.idle',
  Dead: 'terminal:status.dead',
};

const hostAppI18nKey: Record<TerminalApp, string> = {
  ITerm2: 'terminal:hostApp.ITerm2',
  Terminal: 'terminal:hostApp.Terminal',
  IntelliJ: 'terminal:hostApp.IntelliJ',
  Unknown: 'terminal:hostApp.Unknown',
};

// 暂不支持跳转的宿主终端（前端禁用按钮，避免无效 osascript 调用）。
const UNSUPPORTED_HOST: TerminalApp[] = ['IntelliJ', 'Unknown'];

function formatRelativeTime(updatedAt: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (diffSec < 60) {
    return t('terminal:time.justNow');
  }
  if (diffSec < 3600) {
    return t('terminal:time.minutesAgo', { minutes: Math.floor(diffSec / 60) });
  }
  return t('terminal:time.hoursAgo', { hours: Math.floor(diffSec / 3600) });
}

interface SessionCardProps {
  session: SessionInfo;
  onOpenTerminal: (pid: number) => void;
}

function SessionCard({ session, onOpenTerminal }: SessionCardProps) {
  const { t } = useTranslation();
  const unsupported = UNSUPPORTED_HOST.includes(session.hostApp);

  return (
    <Card variant="outlined">
      <CardHeader
        title={session.projectName || session.cwd}
        slotProps={{ title: { fontWeight: 600, noWrap: true } }}
        sx={{ '& .MuiCardHeader-action': { alignSelf: 'center', mt: 0 } }}
        action={(
          <Chip
            size="small"
            color={chipColor[session.status]}
            label={t(statusI18nKey[session.status])}
          />
        )}
      />
      <Divider />
      <CardContent>
        <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap', alignItems: 'center' }}>
          <Chip
            size="small"
            variant="outlined"
            label={t(hostAppI18nKey[session.hostApp])}
          />
          {session.tty && (
            <Typography
              color="text.secondary"
              sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
            >
              {session.tty}
            </Typography>
          )}
        </Box>
        <Typography
          color="text.secondary"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            mb: 0.5,
          }}
        >
          {session.cwd}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatRelativeTime(session.updatedAt, t)}
        </Typography>
      </CardContent>
      <Divider />
      <CardActions>
        <Button
          size="small"
          disabled={unsupported}
          onClick={() => onOpenTerminal(session.pid)}
        >
          {t('terminal:action.openTerminal')}
        </Button>
      </CardActions>
    </Card>
  );
}

export default SessionCard;
