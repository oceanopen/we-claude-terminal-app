import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import aboutEn from './locales/en/about.json';
import claudeSessionsEn from './locales/en/claudeSessions.json';
import commonEn from './locales/en/common.json';
import panelEn from './locales/en/panel.json';
import petEn from './locales/en/pet.json';
import settingsEn from './locales/en/settings.json';
import aboutZhCN from './locales/zh-CN/about.json';
import claudeSessionsZhCN from './locales/zh-CN/claudeSessions.json';
import commonZhCN from './locales/zh-CN/common.json';
import panelZhCN from './locales/zh-CN/panel.json';
import petZhCN from './locales/zh-CN/pet.json';
import settingsZhCN from './locales/zh-CN/settings.json';

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en'] as const;

export const NAMESPACES = ['common', 'settings', 'about', 'claudeSessions', 'panel', 'pet'] as const;

void i18n.use(initReactI18next).init({
  fallbackLng: 'en',
  lng: 'zh-CN',
  defaultNS: 'common',
  ns: NAMESPACES,
  resources: {
    'zh-CN': {
      common: commonZhCN,
      settings: settingsZhCN,
      about: aboutZhCN,
      claudeSessions: claudeSessionsZhCN,
      panel: panelZhCN,
      pet: petZhCN,
    },
    'en': {
      common: commonEn,
      settings: settingsEn,
      about: aboutEn,
      claudeSessions: claudeSessionsEn,
      panel: panelEn,
      pet: petEn,
    },
  },
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
