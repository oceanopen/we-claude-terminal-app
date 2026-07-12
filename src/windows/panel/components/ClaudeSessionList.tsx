import type { ClaudeSessionInfo, ClaudeSessionStatus } from '@src/shared/bindings';
import { Box } from '@mui/material';
import ClaudeSessionCard from './ClaudeSessionCard';
import EmptyState from './EmptyState';

interface ClaudeSessionListProps {
  activeSessions: ClaudeSessionInfo[];
  freeSessions: ClaudeSessionInfo[];
  onOpenTerminal: (pid: number) => void;
}

// 排序优先级：Waiting > Busy > Idle > Dead。同状态内按 updatedAt 倒序（最近活动在前）。
const STATUS_PRIORITY: Record<ClaudeSessionStatus, number> = {
  Waiting: 0,
  Busy: 1,
  Idle: 2,
  Dead: 3,
};

function sortClaudeSessions(sessions: ClaudeSessionInfo[]): ClaudeSessionInfo[] {
  return [...sessions].sort((a, b) => {
    const pri = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
    if (pri !== 0) {
      return pri;
    }
    return b.updatedAt - a.updatedAt;
  });
}

function ClaudeSessionList({ activeSessions, freeSessions, onOpenTerminal }: ClaudeSessionListProps) {
  // 两组状态互斥（Active=Busy/Waiting，Free=Idle），直接拼接无需去重。
  const sessions = [...activeSessions, ...freeSessions];
  if (sessions.length === 0) {
    return <EmptyState />;
  }
  const ordered = sortClaudeSessions(sessions);
  return (
    <Box
      sx={{
        p: 2,
        overflow: 'auto',
        display: 'grid',
        gap: 2,
        gridTemplateColumns: '1fr',
        maxWidth: 1000,
        mx: 'auto',
        alignItems: 'start',
      }}
    >
      {ordered.map(s => (
        <ClaudeSessionCard key={s.pid} session={s} onOpenTerminal={onOpenTerminal} />
      ))}
    </Box>
  );
}

export default ClaudeSessionList;
