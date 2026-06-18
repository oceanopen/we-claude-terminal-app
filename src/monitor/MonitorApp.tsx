import type { SessionInfo } from '@src/shared/bindings';
import { Box, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import SessionList from './components/SessionList';

const NOW = Date.now();

const mockSessions: SessionInfo[] = [
  {
    sessionId: 'mock-1',
    cwd: '/Users/gaopan/MyFiles/Project/we-claude-terminal-monitor',
    projectName: 'we-claude-terminal-monitor',
    title: '实现终端监听窗口的会话卡片组件与三段式布局',
    status: 'Running',
    lastActivity: NOW - 30 * 1000,
  },
  {
    sessionId: 'mock-2',
    cwd: '/Users/gaopan/MyFiles/Project/data-pipeline',
    projectName: 'data-pipeline',
    title: '执行数据库迁移脚本并校验数据一致性',
    status: 'NeedsConfirmation',
    lastActivity: NOW - 2 * 60 * 1000,
  },
  {
    sessionId: 'mock-3',
    cwd: '/Users/gaopan/MyFiles/Project/blog-system',
    projectName: 'blog-system',
    title: '重构用户认证模块，统一 OAuth 与本地登录流程',
    status: 'Completed',
    lastActivity: NOW - 2 * 60 * 60 * 1000,
  },
];

function MonitorApp() {
  const { t } = useTranslation();

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {t('terminal:title')}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <SessionList sessions={mockSessions} />
      </Box>
    </Box>
  );
}

export default MonitorApp;
