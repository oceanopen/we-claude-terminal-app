# Terminal Monitor 开发任务清单

> 需求：监听终端里运行的 Claude Code 会话状态，在托盘首项打开的独立窗口里以卡片列表展示。
> 架构：Tauri v2（Rust 后端 + React 19 + MUI 9）。复用 settings 窗口的单例 + hide-on-close + invoke/emit 模式。
> 实施原则：静态 UI 优先，每个任务对应一个可手动验证的功能点。

## 架构变更说明（2026-06-23 核对）

下列重构发生在 Phase B 完成之后，**未完成**的 Phase D/E/F 任务描述里涉及的路径/模块应据此修正：

1. **目录收纳**（commit e9048f2 + b1d401f）
   - 前端：`src/monitor/` → `src/windows/monitor/`（含 `main.tsx`、`MonitorApp.tsx`、`components/`）
   - 后端：`src-tauri/src/monitor.rs` → `src-tauri/src/windows/monitor.rs`；`i18n.rs`/`tray.rs`/`config.rs` 等迁至 `src-tauri/src/shared/` 与 `src-tauri/src/windows/`
2. **tauri-specta 全量接入**（commit 0d348b5）
   - 共享类型（`ConfigChangedPayload` / `SessionInfo` / `SessionStatus`）改在 `src-tauri/src/shared/types.rs` 定义，经 specta 导出到 `src/shared/bindings.ts`
   - 命令注册统一走 `lib.rs::build_specta_builder()` 的 `collect_commands!`（单一来源，export_bindings.rs 共用），**不再**直接 `app.invoke_handler(...)` 单点注册
   - 原 Phase B 任务 6 设想的 `src/shared/types/monitor.ts` 已废弃，TS 侧一律从 `@src/shared/bindings` 导入类型
3. **多屏定位**（commit 234bee1 + 72b3530）
   - `show_monitor_window` 不再写死 `inner_size(520, 640) + .center()`，改为按 tray 所在屏 work area 按比例（`MONITOR_RATIO`）计算尺寸并居中
   - 公共逻辑收纳在 `src-tauri/src/shared/screen.rs`（`find_monitor_for_tray` / `ratio_size` / `work_area_center`）
4. **路径别名**（commit 601c67a）：`@src/*` 指向项目 `src/`，跨目录 import 已统一改写

## Phase A — 接线骨架（窗口能打开） ✅

> 本 Phase 全部完成。`cargo build` + `pnpm build` 通过；GUI 已在后续迭代中持续验证。

### 任务 1：加 Rust 依赖 ✅
- 文件：`src-tauri/Cargo.toml`（修改）
- 当前：dependencies 无 notify / dirs
- 目标：加 `notify = "6"`（fs 事件监听）、`dirs = "5"`（取 home_dir）
- 验证：`cargo build` 通过

### 任务 2：前端入口骨架 ✅
- 文件：`monitor.html`（新增，照抄 settings.html 改 script 路径）、`src/windows/monitor/main.tsx`（新增，照抄 settings/main.tsx 引 MonitorApp）、`src/windows/monitor/MonitorApp.tsx`（新增，先渲染空 `<Box />`）、`vite.config.ts`（修改，`rollupOptions.input` 加 `monitor: resolve(__dirname, 'monitor.html')`）
- 当前：vite 只有 settings 一个入口
- 目标：vite build 产出 monitor.html，前端入口链路打通
- 验证：`pnpm build` 后 `dist/monitor.html` 存在

### 任务 3：Rust 窗口创建命令 ✅
- 文件：`src-tauri/src/windows/monitor.rs`（新增）、`src-tauri/src/lib.rs`（修改）
- 当前：无 monitor 模块
- 目标：`monitor.rs` 实现 `show_monitor_window(app)`，照抄 `settings.rs` 模式：`WebviewWindowBuilder` label="monitor"、url=`monitor.html`、`.center()`、`.skip_taskbar(true)`、CloseRequested → prevent_close + hide；命令经 `build_specta_builder()` 的 `collect_commands!` 注册
- 验证：`cargo build` 通过
- 备注：窗口尺寸/定位后续演进为多屏 tray 锚点定位（见架构变更说明 §3），不再写死 520×640

### 任务 4：权限 + 托盘菜单首位项 ✅
- 文件：`src-tauri/capabilities/default.json`（修改）、`src-tauri/src/shared/i18n.rs`（修改）、`src-tauri/src/windows/tray.rs`（修改）
- 当前：capabilities windows 只含 "settings"；i18n menu_text 无 monitor case；tray 菜单只有 settings/quit
- 目标：
  - capabilities `windows` 数组首位加 `"monitor"`
  - i18n `menu_text` 加 `(ZhCn, "monitor") => "终端监听"`、`(En, "monitor") => "Terminal Monitor"`
  - tray `setup` 菜单序列首位加 `MenuItem::with_id(app, "monitor", ...)`（在 settings 之前）；`TrayMenuItems` struct 加 `monitor` 字段；`on_menu_event` 加 `"monitor" => show_monitor_window` 分支；`refresh_menu_texts` 加 monitor set_text
- 验证：**里程碑 1 ✅** — `pnpm tauri dev`，点托盘首项「终端监听」弹出 monitor 空窗口

## Phase B — 静态卡片 UI（mock 数据） ✅

> ✅ 本 Phase 全部完成（2026-06-18）：tsc 类型检查 + vite build + eslint 全通过。澄清决策：SessionInfo 字段用 camelCase（与 Phase D Rust serde camelCase 对齐）；相对时间用 `{{minutes}}`/`{{hours}}` 插值。

### 任务 5：i18n 资源文件 + 命名空间注册 ✅
- 文件：`src/shared/i18n/locales/en/terminal.json`（新增）、`src/shared/i18n/locales/zh-CN/terminal.json`（新增）、`src/shared/i18n/index.ts`（修改）
- 当前：NAMESPACES = ['common', 'settings', 'about']
- 目标：新建 terminal namespace 资源（key 至少含 `title` 窗口标题、`empty.title`/`empty.desc` 空态、`status.running`/`status.needsConfirmation`/`status.completed` 状态文案、`action.openTerminal` 按钮文案、`toast.unsupported` 不支持提示含 `{{os}}` 插值、`time.justNow`/`time.minutesAgo`/`time.hoursAgo` 相对时间）；`index.ts` 的 `NAMESPACES` 加 `'terminal'`，import + 注册到 resources
- 验证：前端 `useTranslation('terminal')` 可取到 key

### 任务 6：TS 类型定义 ✅
- 文件：`src/shared/types/monitor.ts`（新增）
- 当前：无 monitor 相关类型
- 目标：导出 `SessionStatus = 'Running' | 'NeedsConfirmation' | 'Completed'`、`SessionInfo = { sessionId, cwd, projectName, title, status, lastActivity: number }`（camelCase，与 Phase D Rust serde camelCase 对齐）
- 验证：类型可被 import
- 备注：tauri-specta 接入后（架构变更 §2）类型迁移至 `src-tauri/src/shared/types.rs`，TS 侧改从 `@src/shared/bindings` import；`src/shared/types/monitor.ts` 已废弃

### 任务 7：SessionCard 组件 ✅
- 文件：`src/monitor/components/SessionCard.tsx`（新增）
- 当前：无
- 目标：props 接收 `session: SessionInfo`；MUI `Card` 三段式：
  - 标题区（`CardHeader` 或自定义 Box）：`project_name` + 状态 `Chip`（Running=primary/NeedsConfirmation=warning/Completed=default）
  - 内容区（`CardContent`）：`title`（任务描述，最多 2 行省略）+ `cwd` 完整路径（mono 字体、text.secondary）+ 相对时间
  - `CardActions`：「打开终端」`Button`（onClick 先空函数）
- 验证：临时在 MonitorApp 渲染 1 张 mock 卡，目视三段式结构正确

### 任务 8：EmptyState 组件 ✅
- 文件：`src/monitor/components/EmptyState.tsx`（新增）
- 当前：无
- 目标：居中展示图标（`DvrOutlined` 或类似）+ 空态标题 + 描述文案，props 接收 i18n 文本或内部 useTranslation
- 验证：临时渲染看到占位

### 任务 9：SessionList 组件 ✅
- 文件：`src/monitor/components/SessionList.tsx`（新增）
- 当前：无
- 目标：props `sessions: SessionInfo[]`；`Stack spacing={2} sx={{ p:2, overflow:'auto' }}`；空数组渲染 `EmptyState`，非空 map 渲染 `SessionCard`
- 验证：临时传 3 条 mock，看到 3 张卡纵向排列

### 任务 10：MonitorApp 接 mock 数据 ✅
- 文件：`src/monitor/MonitorApp.tsx`（修改）
- 当前：渲染空 Box
- 目标：硬编码 3 条 mock `SessionInfo`（覆盖三种状态），用 `useTranslation('terminal')`，外层 `Box sx={{ height:'100vh', display:'flex', flexDirection:'column' }}` + 顶部标题栏 + `SessionList`
- 验证：**里程碑 2** — 打开 monitor 窗口看到 3 张示例卡片（三种状态各一张），三段式结构清晰

## Phase C — i18n 接入 ✅

> ✅ 本 Phase 全部完成（2026-06-23 核对）。任务 7-10 落地时已直接使用 `t('terminal:...')`，全量文案 i18n 化在 Phase B 即完成。
> 里程碑 3 验证依赖的 `config-changed` 事件 + AppI18nProvider 已就绪（`src/shared/AppI18nProvider.tsx` + `src-tauri/src/shared/events.rs`）。

### 任务 11：全量文案 i18n 化 ✅
- 文件：`src/windows/monitor/components/SessionCard.tsx`、`src/windows/monitor/components/SessionList.tsx`、`src/windows/monitor/components/EmptyState.tsx`、`src/windows/monitor/MonitorApp.tsx`（修改）
- 当前：任务 7-10 部分文案可能硬编码（状态 Chip、相对时间等）
- 目标：所有用户可见文案走 `t('terminal:...')`；状态 Chip 文案按 status 映射 `status.running`/`status.needsConfirmation`/`status.completed`；相对时间用 `time.*` key；空态用 `empty.*`
- 验证：**里程碑 3 ✅** — 在设置页切换中/英文，monitor 窗口卡片所有文案实时变化（依赖现有 `config-changed` 事件 + AppI18nProvider 机制，无需额外接线）

## Phase D — Rust 真实数据

### 任务 12：Rust 数据模型 + Store ✅
> ✅ 完成（commit b92e9d0）：`SessionStore(Mutex<HashMap<String, SessionInfo>>)` 落在 `shared/state/monitor.rs`（非任务描述设想的 monitor.rs 内），`init(app)` 模式对齐 config；lib.rs setup 调用 `shared::state::monitor::init(app)?`。`SessionStatus`/`SessionInfo` 的 `#[allow(dead_code)]` 已移除。
- 文件：`src-tauri/src/windows/monitor.rs`（修改）、`src-tauri/src/shared/types.rs`（已有 SessionInfo/SessionStatus 定义）、`src-tauri/src/lib.rs`（修改）
- 当前：`types.rs` 已定义 `SessionStatus` / `SessionInfo`（带 `#[allow(dead_code)]` 注释「后端采集未接入」），但**尚无** `SessionStore`
- 目标：
  - 移除 `SessionStatus` / `SessionInfo` 的 `#[allow(dead_code)]` 标注
  - 定义 `SessionStore(Mutex<HashMap<String, SessionInfo>>)`（位置可放 `src-tauri/src/windows/monitor.rs` 或新建 `src-tauri/src/shared/monitor_state.rs`）
  - `lib.rs` setup 里 `app.manage(SessionStore::default())`
- 验证：`cargo build` 通过

### 任务 13：cwd 解码 + 会话发现 ✅
- 文件：`src-tauri/src/windows/monitor.rs`（修改）、`src-tauri/src/lib.rs`（修改，setup bootstrap 验证）
- 当前：无发现逻辑
- 目标：
  - `fn claude_projects_dir() -> Option<PathBuf>`：`dirs::home_dir().join(".claude").join("projects")`，home_dir 探测失败返回 None
  - **未实现 `decode_cwd`**：原设想 `-`→`/` 反推 cwd 在含 dash 的真实路径上失效（如 `we-claude-terminal-monitor` 会被错误拆成 4 段）。改为 `fn peek_cwd(path) -> Option<String>` 逐行读 jsonl 取首条带 `cwd` 字段事件的 cwd，jsonl 内 cwd 才是 ground truth，slug 有损不可逆
  - `fn discover_session_files() -> Vec<DiscoveredSession>`：遍历 projects 下每个子目录的**直接** .jsonl 文件（跳过 `subagents/` 等嵌套），`is_uuid_like` stem 校验（8-4-4-4-12 hex），staleness 过滤 `mtime < now - 30min` 剔除，peek_cwd 读 cwd
  - 返回 `DiscoveredSession { session_id, cwd, mtime, path: PathBuf }`（非元组），path 字段供 Task 14 解析复用
  - `lib.rs` setup 末尾同步调用一次 `discover_session_files()` + `log::info!` 输出，标注 `TODO(Task 17)` 提示 rescan 接入后移除
- 验证：`cargo build` 通过；`pnpm tauri dev` 启动后终端日志输出 `[monitor] discovered N session(s)`，数量与本机 `ps aux | grep -i claude` 大致吻合，cwd 字段显示真实路径（含 dash 也正确）
- 备注：`DiscoveredSession` 暂带 `#[allow(dead_code)]`（path/session_id 等字段 Task 14 才消费），任务 14 接入后移除

### 任务 14：jsonl 解析（title + status）
- 文件：`src-tauri/src/windows/monitor.rs`（修改）
- 当前：无解析
- 目标：`fn parse_session(path) -> Option<(title, status)>`：
  - 逐行读 jsonl（每行 serde_json::Value）
  - title：找第一条 `type=="user"` 且 `message.content` 为字符串（或第一个 text block）的事件，取纯文本截断 60 字符
  - status：扫描全部事件，跟踪 pending tool_use（`type=="assistant"` 且 content 含 `tool_use` block）减去后续 `type=="user"` 且 content 含 `tool_result` 的配对；末尾仍有未配对 tool_use → NeedsConfirmation；否则看最后一条 user/assistant 时间戳，30s 内 → Running，否则 → Completed
- 验证：对当前活跃 claude 会话输出 title + status，人工核对合理

### 任务 15：get_monitor_sessions 命令
- 文件：`src-tauri/src/windows/monitor.rs`（修改）、`src-tauri/src/lib.rs`（修改 `build_specta_builder`）
- 当前：无此命令
- 目标：`#[tauri::command] #[specta::specta] fn get_monitor_sessions(state: State<SessionStore>) -> Result<Vec<SessionInfo>, String>` 读 store clone 返回；`lib.rs::build_specta_builder()` 的 `collect_commands!` 数组追加此命令（变更后必须重跑 `pnpm gen:bindings` 同步 bindings.ts）
- 验证：前端 devtools console `await window.__TAURI__.core.invoke('get_monitor_sessions')` 返回真实数组

### 任务 16：前端接入真实数据
- 文件：`src/windows/monitor/MonitorApp.tsx`（修改）、可选新增 `src/shared/api/monitor.ts` 封装 invoke
- 当前：硬编码 3 条 mock
- 目标：`useEffect` 里 `invoke('get_monitor_sessions')`，setSessions；加 loading 态（CircularProgress）+ error 态（Alert）；移除 mock
- 验证：**里程碑 4** — 打开 monitor 窗口看到本机真实 claude 会话列表，标题是首条 user 消息，状态合理

## Phase E — 实时监听

### 任务 17：rescan 全量逻辑
- 文件：`src-tauri/src/windows/monitor.rs`（修改）
- 当前：发现 + 解析是分离函数
- 目标：封装 `fn rescan(app: &AppHandle)`：调 discover → parse 全部 → 组装 SessionInfo → 写入 store（替换而非合并，保证消失的会话被清除）
- 验证：临时手动触发 rescan，日志输出 store session 数量变化

### 任务 18：notify fs watcher
- 文件：`src-tauri/src/windows/monitor.rs`（修改）、`src-tauri/src/lib.rs`（修改）
- 当前：无监听
- 目标：`fn start_watcher(app: AppHandle)`：`notify::RecommendedWatcher` 监听 `~/.claude/projects/` 递归（`RecursiveMode::Recursive`），on-event（Create/Modify/Remove） debounce 后 spawn `rescan(app)`；`lib.rs` setup 末尾 `tauri::async_runtime::spawn` 启动
- 验证：手动 `touch ~/.claude/projects/<dir>/<some>.jsonl`，日志看到 rescan 触发

### 任务 19：5s 兜底轮询
- 文件：`src-tauri/src/windows/monitor.rs`（修改）、`src-tauri/src/lib.rs`（修改）
- 当前：无轮询
- 目标：`tokio::spawn` 周期任务，每 5s 调 `rescan(app)`（兜底 notify 漏报 + 推动 staleness 老化）
- 验证：日志周期输出 rescan

### 任务 20：事件推送
- 文件：`src-tauri/src/windows/monitor.rs`（修改）、`src-tauri/src/shared/events.rs`（加事件常量）、`src-tauri/src/shared/types.rs`（加事件 payload 类型并经 specta 导出）
- 当前：rescan 只写 store
- 目标：rescan 末尾 `app.emit(EVENT_MONITOR_SESSIONS_CHANGED, &sessions_vec)`（sessions_vec 为 store 当前快照）；事件常量与 payload 类型按 `config-changed` 模式建好
- 验证：前端临时 listen，console 看到事件 payload

### 任务 21：前端 listen 接入
- 文件：`src/windows/monitor/MonitorApp.tsx`（修改）
- 当前：仅初次 invoke
- 目标：`listen('monitor:sessions-changed', e => setSessions(e.payload))`；初次仍 invoke 拿首屏；卸载时 unlisten（参考记忆 [[tauri-listen-unlisten-race]]：cleanup 用 `.then(fn=>fn()).catch()` 避开 StrictMode 竞态）
- 验证：**里程碑 5** — 新开终端跑 `claude`，monitor 窗口实时出现新卡片；对话推进时状态/title 变化；关闭会话 30min 后卡片消失

## Phase F — 打开终端按钮

### 任务 22：open_terminal 命令
- 文件：`src-tauri/src/windows/monitor.rs`（修改）、`src-tauri/src/lib.rs`（修改 `build_specta_builder`）
- 当前：无此命令
- 目标：`#[tauri::command] #[specta::specta] fn open_terminal(session_id: String, app: AppHandle) -> Result<(), String>`：v1 不实现真实打开，按 `cfg!(target_os)` 返回中/英文 Err：macOS → `"当前 macOS 暂不支持此功能"` / Windows → `"当前 Windows 暂不支持此功能"`；在 `build_specta_builder()` 的 `collect_commands!` 数组追加
- 验证：devtools invoke 返回对应错误

### 任务 23：按钮接 toast
- 文件：`src/windows/monitor/components/SessionCard.tsx`（修改）、`src/windows/monitor/MonitorApp.tsx`（修改，加 Snackbar）
- 当前：按钮 onClick 空函数
- 目标：按钮 onClick → `invoke('open_terminal', { sessionId })`，`.catch(msg => setToast(msg))`；MonitorApp 顶层 `<Snackbar open={!!toast} message={toast} onClose={...} />`；文案也可走 i18n `toast.unsupported` 带 `{{os}}` 插值
- 验证：**里程碑 6** — 点击任一卡片「打开终端」按钮，弹出「当前 macOS 暂不支持此功能」toast（Windows 下同理）

---

## 里程碑汇总

| 里程碑 | 任务 | 验证方式 |
|---|---|---|
| M1 窗口可打开 ✅ | 1-4 | 点托盘首项弹出 monitor 窗口（尺寸/定位按 tray 所在屏，不再写死 520×640） |
| M2 静态卡片可见 ✅ | 5-10 | 窗口显示 3 张 mock 卡（三段式），tsc+build+lint 通过，GUI 已迭代验证 |
| M3 i18n 切换 ✅ | 11 | 设置页切语言，卡片文案实时变（复用现有 `config-changed` 事件 + AppI18nProvider） |
| M4 真实数据 | 12-16 | 窗口显示本机真实 claude 会话 |
| M5 实时监听 | 17-21 | 新开会话实时出现，老化后消失 |
| M6 打开终端 toast | 22-23 | 点击按钮弹「暂不支持」toast |
