import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppI18nProvider from '../shared/AppI18nProvider';
import AppThemeProvider from '../shared/AppThemeProvider';
import SettingsApp from './SettingsApp';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppThemeProvider>
      <AppI18nProvider>
        <SettingsApp />
      </AppI18nProvider>
    </AppThemeProvider>
  </StrictMode>,
);
