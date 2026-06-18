import { commands } from './bindings';
import { unwrap } from './commands';

// 本文件是所有配置项 key + 默认值的唯一可信源 (SSOT)。
// 后端 src-tauri/src/shared/config.rs 中 LANGUAGE_KEY 有对应常量副本（用于托盘菜单语言判定），
// 修改任一 *KEY / DEFAULT_* 时必须同步后端，否则首次启动会出现前后端兜底不一致。

export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCE_KEY = 'appearance';
export const DEFAULT_APPEARANCE: Appearance = 'system';

export type Language = 'system' | 'zh-CN' | 'en';

export type ResolvedLanguage = Exclude<Language, 'system'>;

export const LANGUAGE_KEY = 'language';
export const DEFAULT_LANGUAGE: Language = 'system';

// commands.xxx() 返回 tauri-specta 的 typedError 包装。unwrap 展开为 throw 风格，
// 保持 getConfig/setConfig 的对外 API 不变（错误时 throw）。
export async function getConfig(key: string): Promise<string | null> {
  return unwrap(commands.getConfig(key));
}

export async function setConfig(key: string, value: string): Promise<void> {
  await unwrap(commands.setConfig(key, value));
}
