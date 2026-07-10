import type { SessionInfo, SessionStatus, TerminalApp } from '@src/shared/bindings';
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
import { formatDate, formatRelativeTime } from '@src/shared/time';
import { useTranslation } from 'react-i18next';

const chipColor: Record<SessionStatus, 'warning' | 'info' | 'default' | 'error'> = {
  Busy: 'warning',
  Waiting: 'info',
  Idle: 'default',
  Dead: 'error',
};

const statusI18nKey: Record<SessionStatus, string> = {
  Busy: 'monitor:status.busy',
  Waiting: 'monitor:status.waiting',
  Idle: 'monitor:status.idle',
  Dead: 'monitor:status.dead',
};

const hostAppI18nKey: Record<TerminalApp, string> = {
  ITerm2: 'monitor:hostApp.ITerm2',
  Terminal: 'monitor:hostApp.Terminal',
  IntelliJ: 'monitor:hostApp.IntelliJ',
  Unknown: 'monitor:hostApp.Unknown',
};

// 暂不支持跳转的宿主终端（前端禁用按钮，避免无效 osascript 调用）。
const UNSUPPORTED_HOST: TerminalApp[] = ['IntelliJ', 'Unknown'];

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
          {formatRelativeTime(session.updatedAt, t)} | {formatDate(session.updatedAt, 'YYYY-MM-DD HH:mm:ss')}
        </Typography>
      </CardContent>
      <Divider />
      <CardActions sx={{ justifyContent: 'flex-end' }}>
        <Button
          size="small"
          disabled={unsupported}
          onClick={() => onOpenTerminal(session.pid)}
        >
          {t('monitor:action.openHost', { host: t(hostAppI18nKey[session.hostApp]) })}
        </Button>
      </CardActions>
    </Card>
  );
}

export default SessionCard;
