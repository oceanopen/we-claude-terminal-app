import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import SensorsOutlinedIcon from '@mui/icons-material/SensorsOutlined';
import {
  alpha,
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  useTheme,
} from '@mui/material';
import { EVENT_PANEL_NAVIGATE } from '@src/shared/events';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ClaudeSessionsPage from './ClaudeSessionsPage';
import RepositoriesPage from './RepositoriesPage';

// panel 窗口（控制台）是各种场景管理页面的通用容器。
// 左侧菜单 + 右侧内容的交互复刻自 settings 窗口（SettingsApp）：
// useState<MenuKey> 单状态 + menuItems 配置数组驱动左侧 List + 右侧条件渲染。
// 当前菜单：Claude 会话监听、本地仓库管理；后续在此数组追加新菜单项即可扩展。
type MenuKey = 'claudeSessions' | 'repositories';

function PanelApp() {
  const { t } = useTranslation();
  const [activeMenu, setActiveMenu] = useState<MenuKey>('claudeSessions');
  const theme = useTheme();

  // 监听后端 panel:navigate 事件，切换到指定页面（如 pet 点击打开控制台时自动导航到 Claude 会话监听页）。
  useEffect(() => {
    const unlisten = listen<MenuKey>(EVENT_PANEL_NAVIGATE, (e) => {
      setActiveMenu(e.payload);
    });
    return () => {
      unlisten.then(fn => fn()).catch(err => console.warn('[PanelApp] unlisten panel:navigate failed:', err));
    };
  }, []);

  const menuItems: { key: MenuKey; label: string; icon: React.ReactNode }[] = [
    { key: 'claudeSessions', label: t('panel:menu.claudeSessions'), icon: <SensorsOutlinedIcon /> },
    { key: 'repositories', label: t('panel:menu.repositories'), icon: <FolderOutlinedIcon /> },
  ];

  return (
    <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Box
        sx={{
          width: 200,
          flexShrink: 0,
          borderRight: 1,
          borderColor: 'divider',
          display: 'flex',
          flexDirection: 'column',
          bgcolor: 'background.paper',
        }}
      >
        <Box sx={{ p: 2, textAlign: 'center' }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} color="text.secondary">
            {t('common:brand')}
          </Typography>
        </Box>
        <List sx={{ px: 1 }}>
          {menuItems.map(item => (
            <ListItemButton
              key={item.key}
              selected={activeMenu === item.key}
              onClick={() => setActiveMenu(item.key)}
              sx={{
                'borderRadius': 2,
                'mb': 0.5,
                '&.Mui-selected': {
                  bgcolor:
                    theme.palette.mode === 'light'
                      ? alpha(theme.palette.primary.main, 0.15)
                      : alpha(theme.palette.primary.main, 0.35),
                },
                '&.Mui-selected:hover': {
                  bgcolor:
                    theme.palette.mode === 'light'
                      ? alpha(theme.palette.primary.main, 0.15)
                      : alpha(theme.palette.primary.main, 0.35),
                },
                '& .MuiListItemText-primary': {
                  fontWeight: 600,
                  fontSize: '0.875rem',
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36, color: 'text.primary' }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {activeMenu === 'claudeSessions' && <ClaudeSessionsPage />}
        {activeMenu === 'repositories' && <RepositoriesPage />}
      </Box>
    </Box>
  );
}

export default PanelApp;
