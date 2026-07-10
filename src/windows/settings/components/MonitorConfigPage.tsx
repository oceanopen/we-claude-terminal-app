import SensorsOutlinedIcon from '@mui/icons-material/SensorsOutlined';
import { Box, Button, FormHelperText, Slider, Typography } from '@mui/material';
import {
  DEFAULT_POLL_INTERVAL_SECS,
  getConfig,
  MAX_POLL_INTERVAL_SECS,
  MIN_POLL_INTERVAL_SECS,
  POLL_INTERVAL_SECS_KEY,
  setConfig,
} from '@src/shared/config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

function MonitorConfigPage() {
  const { t } = useTranslation();

  const [savedInterval, setSavedInterval] = useState<number>(DEFAULT_POLL_INTERVAL_SECS);
  const [draftInterval, setDraftInterval] = useState<number>(DEFAULT_POLL_INTERVAL_SECS);

  useEffect(() => {
    getConfig(POLL_INTERVAL_SECS_KEY).then((v) => {
      const parsed = v != null ? Number.parseInt(v, 10) : Number.NaN;
      if (Number.isFinite(parsed)) {
        // DB 可能存越界或非 step 倍数（直接改 DB / 旧脏数据），clamp 到合法范围。
        const clamped = Math.min(Math.max(parsed, MIN_POLL_INTERVAL_SECS), MAX_POLL_INTERVAL_SECS);
        setSavedInterval(clamped);
        setDraftInterval(clamped);
      }
    });
  }, []);

  const dirty = draftInterval !== savedInterval;

  const handleReset = () => setDraftInterval(DEFAULT_POLL_INTERVAL_SECS);
  const handleCancel = () => setDraftInterval(savedInterval);
  const handleSave = async () => {
    await setConfig(POLL_INTERVAL_SECS_KEY, String(draftInterval));
    setSavedInterval(draftInterval);
  };

  const marks = [
    { value: MIN_POLL_INTERVAL_SECS, label: `${MIN_POLL_INTERVAL_SECS}` },
    { value: 30, label: '30' },
    { value: DEFAULT_POLL_INTERVAL_SECS, label: `${DEFAULT_POLL_INTERVAL_SECS}` },
    { value: MAX_POLL_INTERVAL_SECS, label: `${MAX_POLL_INTERVAL_SECS}` },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 3, flex: 1, overflow: 'auto' }}>
        <Typography variant="h6" sx={{ mb: 3 }}>
          {t('settings:page.monitorConfigTitle')}
        </Typography>

        <Box sx={{ borderRadius: 2, border: 1, borderColor: 'divider', overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 2 }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <SensorsOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                <Typography>{t('settings:row.pollInterval')}</Typography>
              </Box>
              <Typography
                sx={{ minWidth: 48, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
              >
                {draftInterval}
                {t('settings:unit.seconds')}
              </Typography>
            </Box>

            <Slider
              value={draftInterval}
              onChange={(_, v) => setDraftInterval(v as number)}
              min={MIN_POLL_INTERVAL_SECS}
              max={MAX_POLL_INTERVAL_SECS}
              step={5}
              marks={marks}
              sx={{ mt: 1 }}
            />

            <FormHelperText>{t('settings:help.pollInterval')}</FormHelperText>
          </Box>
        </Box>
      </Box>

      <Box
        sx={{
          p: 2,
          borderTop: 1,
          borderColor: 'divider',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
        }}
      >
        <Button onClick={handleReset} color="inherit">
          {t('settings:button.reset')}
        </Button>
        <Button onClick={handleCancel} disabled={!dirty} color="inherit">
          {t('settings:button.cancel')}
        </Button>
        <Button onClick={handleSave} disabled={!dirty} variant="contained">
          {t('settings:button.save')}
        </Button>
      </Box>
    </Box>
  );
}

export default MonitorConfigPage;
