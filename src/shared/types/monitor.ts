export type SessionStatus = 'Running' | 'NeedsConfirmation' | 'Completed';

export interface SessionInfo {
  sessionId: string;
  cwd: string;
  projectName: string;
  title: string;
  status: SessionStatus;
  lastActivity: number;
}
