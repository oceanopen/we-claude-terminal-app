import type { ConfigChangedPayload } from './bindings';
import type { Appearance } from './config';
import { createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useMemo, useState } from 'react';
import {

  APPEARANCE_KEY,
  DEFAULT_APPEARANCE,
  getConfig,
} from './config';
import { EVENT_CONFIG_CHANGED } from './events';
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
    const unlistenPromise = listen<ConfigChangedPayload>(
      EVENT_CONFIG_CHANGED,
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
    () =>
      createTheme({
        palette: { mode: resolvedMode },
        components: {
          // MuiButton 默认 text-transform: uppercase 会把 "iTerm2" 渲染成 "ITEM2"，
          // 全局关掉，让按钮文案保持原样大小写。
          MuiButton: {
            styleOverrides: { root: { textTransform: 'none' } },
          },
        },
      }),
    [resolvedMode],
  );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}
