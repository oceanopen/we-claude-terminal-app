// tauri-specta commands.xxx() 的返回类型分两类：
//   - 命令返回 Result<T, E>：包装为 CommandResult 联合类型（status: 'ok' | 'error'）
//   - 命令返回裸 T（无 Result）：直接 Promise<T>，错误时 invoke 抛 reject
// unwrap / logOnError 处理前者；safeAwait 处理后者。所有 commands 调用应统一使用其一。

export type CommandResult<T, E = string>
  = | { status: 'ok'; data: T }
    | { status: 'error'; error: E };

// 适合调用方需要 try/catch 的场景：错误时 throw r.error。
export async function unwrap<T, E>(p: Promise<CommandResult<T, E>>): Promise<T> {
  const r = await p;
  if (r.status === 'ok') {
    return r.data;
  }
  throw r.error;
}

// 适合 fire-and-forget 的 typedError 命令：错误时仅打 warn，不 throw。
export async function logOnError<T, E>(
  p: Promise<CommandResult<T, E>>,
  tag: string,
): Promise<void> {
  const r = await p;
  if (r.status === 'error') {
    console.warn(`[${tag}]`, r.error);
  }
}

// 适合无 Result 包装的命令（错误时 invoke reject 而非返回 typedError）：
// 错误时仅打 warn，不抛出。
export async function safeAwait<T>(p: Promise<T>, tag: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    console.warn(`[${tag}]`, e);
  }
}
