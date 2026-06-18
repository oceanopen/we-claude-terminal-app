import type { Appearance } from './config';
import { createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useMemo, useState } from 'react';
import {

  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  getConfig,
} from './config';
import { useSystemThemeMode } from './useSystemTheme';

interface Props {
  children: React.ReactNode;
}

export default function AppThemeProvider({ children }: Props) {
  const [appearance, setAppearance] = useState<Appearance>(DEFAULT_APPEARANCE);
  const systemMode = useSystemThemeMode();

  useEffect(() => {
    getConfig(APPEARANCE_KEY).then((v) => {
      if (v === 'system' || v === 'light' || v === 'dark') {
        setAppearance(v);
      }
    });
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<{ key: string; value: string }>(
      'config-changed',
      (e) => {
        if (e.payload.key === APPEARANCE_KEY) {
          const v = e.payload.value;
          if (v === 'system' || v === 'light' || v === 'dark') {
            setAppearance(v);
          }
        }
      },
    );
    return () => {
      unlistenPromise
        .then(fn => fn())
        .catch((err: unknown) => {
          console.warn('[config-changed] unlisten failed (possible Tauri event race):', err);
        });
    };
  }, []);

  const resolvedMode = appearance === 'system' ? systemMode : appearance;

  const theme = useMemo(
    () => createTheme({ palette: { mode: resolvedMode } }),
    [resolvedMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
