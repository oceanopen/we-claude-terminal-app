import { invoke } from '@tauri-apps/api/core';

export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCE_KEY = 'appearance';
export const DEFAULT_APPEARANCE: Appearance = 'system';

export type Language = 'system' | 'zh-CN' | 'en';

export type ResolvedLanguage = Exclude<Language, 'system'>;

export const LANGUAGE_KEY = 'language';
export const DEFAULT_LANGUAGE: Language = 'system';

export async function getConfig(key: string): Promise<string | null> {
  return invoke<string | null>('get_config', { key });
}

export async function setConfig(key: string, value: string): Promise<void> {
  await invoke('set_config', { key, value });
}
