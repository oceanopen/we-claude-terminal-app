import type { SessionInfo, SessionStatus } from '../../shared/types/monitor';
import {
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

const chipColor: Record<SessionStatus, 'primary' | 'warning' | 'default'> = {
  Running: 'primary',
  NeedsConfirmation: 'warning',
  Completed: 'default',
};

const statusI18nKey: Record<SessionStatus, string> = {
  Running: 'terminal:status.running',
  NeedsConfirmation: 'terminal:status.needsConfirmation',
  Completed: 'terminal:status.completed',
};

function formatRelativeTime(lastActivity: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - lastActivity) / 1000));
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
}

function SessionCard({ session }: SessionCardProps) {
  const { t } = useTranslation();

  return (
    <Card variant="outlined">
      <CardHeader
        title={session.projectName}
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
        <Typography
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            mb: 1,
          }}
        >
          {session.title}
        </Typography>
        <Typography
          color="text.secondary"
          sx={{
            fontFamily: 'monospace',
            fontSize: '0.75rem',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {session.cwd}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {formatRelativeTime(session.lastActivity, t)}
        </Typography>
      </CardContent>
      <Divider />
      <CardActions>
        <Button size="small">{t('terminal:action.openTerminal')}</Button>
      </CardActions>
    </Card>
  );
}

export default SessionCard;
