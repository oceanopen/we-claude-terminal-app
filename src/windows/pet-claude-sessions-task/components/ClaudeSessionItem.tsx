import type { ClaudeSessionInfo, ClaudeSessionStatus, TerminalApp } from '@src/shared/bindings';
import { Box, ListItemButton, Typography } from '@mui/material';
import { STATUS_COLOR } from '@src/shared/sessionStatus';
import { useTranslation } from 'react-i18next';

// 状态文案复用 claudeSessions 命名空间（运行中/等待输入/空闲/已失效）。
const STATUS_I18N_KEY: Record<ClaudeSessionStatus, string> = {
  Busy: 'claudeSessions:status.busy',
  Waiting: 'claudeSessions:status.waiting',
  Idle: 'claudeSessions:status.idle',
  Dead: 'claudeSessions:status.dead',
};

// 暂不支持跳转的宿主终端（与 ClaudeSessionCard 保持一致，禁用点击）。
const UNSUPPORTED_HOST: TerminalApp[] = ['IntelliJ', 'Unknown'];

interface ClaudeSessionItemProps {
  session: ClaudeSessionInfo;
  onClick: (pid: number) => void;
}

function ClaudeSessionItem({ session, onClick }: ClaudeSessionItemProps) {
  const { t } = useTranslation();
  const unsupported = UNSUPPORTED_HOST.includes(session.hostApp);
  const color = STATUS_COLOR[session.status];

  return (
    <ListItemButton
      disabled={unsupported}
      onClick={() => onClick(session.pid)}
      sx={{
        'px': 1.5,
        'py': 1,
        'borderRadius': 1,
        // 密集列表：hover 高亮 + 选中态收敛
        '&.Mui-disabled': { opacity: 0.5 },
      }}
    >
      <Typography
        sx={{
          flex: 1,
          fontWeight: 600,
          fontSize: '0.875rem',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {session.projectName || session.cwd}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 1, flexShrink: 0 }}>
        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: color }} />
        <Typography
          variant="caption"
          sx={{ color, fontWeight: 700, fontSize: '0.7rem' }}
        >
          {t(STATUS_I18N_KEY[session.status])}
        </Typography>
      </Box>
    </ListItemButton>
  );
}

export default ClaudeSessionItem;
