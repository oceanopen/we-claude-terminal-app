import AutorenewIcon from '@mui/icons-material/Autorenew';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { Box, Button, Chip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import appIcon from '../../assets/app-icon.png';

declare const __APP_VERSION__: string;

function AboutPage() {
  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: 1.5,
        px: 3,
        py: 4,
      }}
    >
      <Box
        component="img"
        src={appIcon}
        alt={t('common:brand')}
        sx={{
          width: 80,
          height: 80,
          borderRadius: 3,
          mb: 1,
        }}
      />

      <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
        {t('common:brand')}
      </Typography>

      <Typography variant="body2" color="text.secondary">
        {t('about:subtitle')}
      </Typography>

      <Chip label={`v${__APP_VERSION__}`} size="small" />

      <Typography variant="body2" color="text.secondary">
        {t('about:slogan')}
      </Typography>

      <Button
        variant="outlined"
        size="small"
        startIcon={<AutorenewIcon />}
        sx={{ mt: 1, textTransform: 'none' }}
      >
        {t('about:checkUpdate')}
      </Button>

      <Typography
        component="a"
        role="button"
        variant="body2"
        color="primary"
        sx={{
          'textDecoration': 'none',
          'cursor': 'pointer',
          '&:hover': { textDecoration: 'underline' },
          'mt': 1,
        }}
        onClick={() => {
          import('@tauri-apps/plugin-shell').then(({ open }) => {
            open('https://github.com/oceanopen/we-claude-terminal-monitor');
          });
        }}
      >
        GitHub
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 'auto', pt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {t('about:madeWith')}
        </Typography>
        <FavoriteIcon sx={{ fontSize: 12, color: 'error.main' }} />
        <Typography variant="caption" color="text.secondary">
          {t('about:forHealth')}
        </Typography>
      </Box>
    </Box>
  );
}

export default AboutPage;
