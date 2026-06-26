import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import aboutEn from './locales/en/about.json';
import commonEn from './locales/en/common.json';
import petEn from './locales/en/pet.json';
import settingsEn from './locales/en/settings.json';
import terminalEn from './locales/en/terminal.json';
import aboutZhCN from './locales/zh-CN/about.json';
import commonZhCN from './locales/zh-CN/common.json';
import petZhCN from './locales/zh-CN/pet.json';
import settingsZhCN from './locales/zh-CN/settings.json';
import terminalZhCN from './locales/zh-CN/terminal.json';

export const SUPPORTED_LANGUAGES = ['zh-CN', 'en'] as const;

export const NAMESPACES = ['common', 'settings', 'about', 'terminal', 'pet'] as const;

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
      terminal: terminalZhCN,
      pet: petZhCN,
    },
    'en': {
      common: commonEn,
      settings: settingsEn,
      about: aboutEn,
      terminal: terminalEn,
      pet: petEn,
    },
  },
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

export default i18n;
