import type { YesNo } from './bindings';
import { commands } from './bindings';
import { unwrap } from './commands';

// 本文件是所有配置项 key + 默认值的唯一可信源 (SSOT)。
// 后端 src-tauri/src/shared/config.rs 中 LANGUAGE_KEY 有对应常量副本（用于托盘菜单语言判定），
// 修改任一 *KEY / DEFAULT_* 时必须同步后端，否则首次启动会出现前后端兜底不一致。

// Y/N 布尔风格配置值。类型 YesNo 由后端 types.rs 的 enum 经 gen:bindings 自动生成，
// 此处只保留值常量（specta 不导出 const），用 satisfies 关联后端类型确保取值合法：
// 后端 #[serde(rename = "Y"/"N")] 改动后，此处值若不一致会编译报错。
export const YES_NO = {
  YES: 'Y',
  NO: 'N',
} as const satisfies Record<string, YesNo>;

export function isYes(value: string | null): boolean {
  return value === YES_NO.YES;
}

export function toYesNo(value: boolean): YesNo {
  return value ? YES_NO.YES : YES_NO.NO;
}

export function parseYesNo(value: string | null, fallback: YesNo): YesNo {
  return value === YES_NO.YES || value === YES_NO.NO ? value : fallback;
}

export type Appearance = 'system' | 'light' | 'dark';

export const APPEARANCE_KEY = 'appearance';
export const DEFAULT_APPEARANCE: Appearance = 'system';

export type Language = 'system' | 'zh-CN' | 'en';

export type ResolvedLanguage = Exclude<Language, 'system'>;

export const LANGUAGE_KEY = 'language';
export const DEFAULT_LANGUAGE: Language = 'system';

// 桌宠拖拽开关。值用 YesNo，缺失视为 NO（默认关闭：点击桌宠打开监控页）。
// 与后端 config.rs 的 PET_DRAGGABLE_KEY 对齐，修改任一处需同步另一处。
export const PET_DRAGGABLE_KEY = 'pet_draggable';
export const DEFAULT_PET_DRAGGABLE = YES_NO.NO;

// sessions 兜底轮询周期（秒）。即时性由 fs watcher 负责，此处仅驱动 Dead 老化与漏报兜底。
// min/max/clamp 与后端 config.rs 镜像，改动任一处需同步另一处。
export const POLL_INTERVAL_SECS_KEY = 'poll_interval_secs';
export const DEFAULT_POLL_INTERVAL_SECS = 60;
export const MIN_POLL_INTERVAL_SECS = 5;
export const MAX_POLL_INTERVAL_SECS = 120;

// commands.xxx() 返回 tauri-specta 的 typedError 包装。unwrap 展开为 throw 风格，
// 保持 getConfig/setConfig 的对外 API 不变（错误时 throw）。
export async function getConfig(key: string): Promise<string | null> {
  return unwrap(commands.getConfig(key));
}

export async function setConfig(key: string, value: string): Promise<void> {
  await unwrap(commands.setConfig(key, value));
}
