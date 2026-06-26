import type { SessionInfo, SessionStatus } from '@src/shared/bindings';
import { Box } from '@mui/material';
import EmptyState from './EmptyState';
import SessionCard from './SessionCard';

interface SessionListProps {
  sessions: SessionInfo[];
  onOpenTerminal: (pid: number) => void;
}

// 排序优先级：Busy > Waiting > Idle > Dead。同状态内按 updatedAt 倒序（最近活动在前）。
const STATUS_PRIORITY: Record<SessionStatus, number> = {
  Busy: 0,
  Waiting: 1,
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

function SessionList({ sessions, onOpenTerminal }: SessionListProps) {
  if (sessions.length === 0) {
    return <EmptyState />;
  }
  const ordered = sortSessions(sessions);
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
        <SessionCard key={s.pid} session={s} onOpenTerminal={onOpenTerminal} />
      ))}
    </Box>
  );
}

export default SessionList;
