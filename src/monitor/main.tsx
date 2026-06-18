import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppI18nProvider from '../shared/AppI18nProvider';
import AppThemeProvider from '../shared/AppThemeProvider';
import MonitorApp from './MonitorApp';
import '../settings/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppThemeProvider>
      <AppI18nProvider>
        <MonitorApp />
      </AppI18nProvider>
    </AppThemeProvider>
  </StrictMode>,
);
