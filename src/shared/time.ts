import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';

type DateInput = Dayjs | Date | number | string;

/**
 * 把日期对象/时间戳格式化为指定模式（本地时区）。
 *
 * pattern 遵循 dayjs 占位符：`YYYY-MM-DD HH:mm:ss`（大写 HH=24 小时制，hh=12 小时制）。
 * 与原生 `new Date()` 的 getHours 等同为本地时区行为。
 */
export function formatDate(date: DateInput, pattern: string): string {
  return dayjs(date).format(pattern);
}

/**
 * 相对时间文案（刚刚 / X 分钟前 / X 小时前），依赖调用方注入的 i18n t。
 * namespace 默认 'claudeSessions'（向后兼容），用到的 i18n key：${namespace}:time.{justNow, minutesAgo, hoursAgo}。
 * 新页面（如 repositories）传入对应命名空间即可复用，无需各自实现相对时间逻辑。
 */
export function formatRelativeTime(
  updatedAt: number,
  t: (key: string, opts?: Record<string, unknown>) => string,
  namespace = 'claudeSessions',
): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - updatedAt) / 1000));
  if (diffSec < 60) {
    return t(`${namespace}:time.justNow`);
  }
  if (diffSec < 3600) {
    return t(`${namespace}:time.minutesAgo`, { minutes: Math.floor(diffSec / 60) });
  }
  return t(`${namespace}:time.hoursAgo`, { hours: Math.floor(diffSec / 3600) });
}
