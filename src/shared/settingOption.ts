import type { Appearance, Language } from './config';

export interface LanguageOption {
  value: Language;
  labelKey: string;
}

export const languageOptions: LanguageOption[] = [
  { value: 'system', labelKey: 'settings:option.followSystem' },
  { value: 'zh-CN', labelKey: 'settings:option.chinese' },
  { value: 'en', labelKey: 'settings:option.english' },
];

export interface AppearanceOption {
  value: Appearance;
  labelKey: string;
}

export const appearanceOptions: AppearanceOption[] = [
  { value: 'system', labelKey: 'settings:option.followSystem' },
  { value: 'light', labelKey: 'settings:option.light' },
  { value: 'dark', labelKey: 'settings:option.dark' },
];
