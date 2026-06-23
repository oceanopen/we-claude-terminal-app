import type { SessionInfo } from '@src/shared/bindings';
import { Box } from '@mui/material';
import EmptyState from './EmptyState';
import SessionCard from './SessionCard';

interface SessionListProps {
  sessions: SessionInfo[];
}

function SessionList({ sessions }: SessionListProps) {
  if (sessions.length === 0) {
    return <EmptyState />;
  }
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
      {sessions.map(s => (
        <SessionCard key={s.sessionId} session={s} />
      ))}
    </Box>
  );
}

export default SessionList;
