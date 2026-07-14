// 跨 IPC 边界的共享类型（Rust ↔ TypeScript）。
// 通过 tauri-specta 自动导出到 src/shared/bindings.ts（运行 `pnpm gen:bindings`）。
// 修改本文件后必须重新生成 bindings.ts，否则前后端类型会漂移。

use serde::{Deserialize, Serialize};
use specta::Type;
// Number 用于把 i64/u32 等 BigInt-style 类型在 specta 导出时映射为 TS `number`。
// startedAt/updatedAt 是毫秒时间戳（远小于 2^53），精度安全。
use specta_typescript::Number;

// ============================================================
// ConfigChangedPayload：config-changed 事件
// ============================================================

/// set_config 命令成功后通过 `config-changed` 事件广播给所有窗口的载荷。
/// 订阅方（AppThemeProvider / AppI18nProvider）据此响应配置变化。
#[derive(Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigChangedPayload {
    /// 变更的配置 key（与 src/shared/config.ts 中的 *_KEY 常量对齐）。
    pub key: String,
    /// 新值（配置统一以字符串形式存储，订阅方按 key 自行 decode）。
    pub value: String,
}

// ============================================================
// 终端会话：panel 窗口卡片 / pet 窗口桌宠状态
// ============================================================

/// 终端会话状态。直接映射 `~/.claude/sessions/<pid>.json` 里的 `status` 字段
/// （busy/waiting/idle）外加两个本地推断状态：GitPending（空闲且有未提交改动）与
/// Dead（进程已退出但 json 残留）。前端 ClaudeSessionCard 据此切换状态 Chip 配色与文案。
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize, Type)]
pub enum ClaudeSessionStatus {
    /// 运行中：Claude 正在执行工具/生成回复。
    Busy,
    /// 等待输入：Claude 已完成回复，等用户输入。
    Waiting,
    /// 空闲：会话长时间无活动，但仍存活。
    Idle,
    /// 本地派生：会话空闲（base=Idle）且其 cwd 存在未提交 git 改动（含 untracked）。
    /// 由 `store::rescan` 在 enrich 后二次判定，不来自 Claude json。
    /// 有界过期：fs watcher 触发的 rescan（force_git=false）复用上次缓存值，
    /// poll（60s）/手动刷新（force_git=true）强制重算，避免 watcher 高频跑 git。
    GitPending,
    /// 已失效：进程已退出，json 残留。discover 阶段会过滤掉，理论上不会出现在前端。
    Dead,
}

/// 宿主终端应用。通过 `ps -p <ppid>` 链式反查 Claude 进程的祖先进程名得出。
/// 用于决定跳转时调用哪个 AppleScript 脚本。
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize, Type)]
pub enum TerminalApp {
    ITerm2,
    Terminal,
    IntelliJ,
    /// 未识别的宿主终端（如 VSCode 内嵌、Wezterm、Alacritty 等）。跳转按钮将禁用。
    Unknown,
}

/// Y/N 布尔风格配置值。serde rename 到单字母，序列化与 specta 导出均为 "Y"/"N"。
#[derive(Clone, Copy, PartialEq, Eq, Debug, Serialize, Deserialize, Type)]
pub enum YesNo {
    #[serde(rename = "Y")]
    Yes,
    #[serde(rename = "N")]
    No,
}

impl YesNo {
    /// 对应的存储字符串（config 层以裸字符串存储，非 JSON，故不走 serde 序列化）。
    pub const fn as_str(self) -> &'static str {
        match self {
            YesNo::Yes => "Y",
            YesNo::No => "N",
        }
    }
}

/// 终端会话快照。ClaudeSessionsPage 渲染 ClaudeSessionCard 列表的数据源；
/// PetClaudeSessionsSummaryApp 聚合所有会话取"最忙"状态作为桌宠展示态。
#[derive(Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeSessionInfo {
    /// Claude Code 进程 pid（也是 `~/.claude/sessions/<pid>.json` 的文件名）。
    pub pid: u32,
    /// Claude Code 会话 ID（uuid）。从 json 的 `sessionId` 字段读取。
    pub session_id: String,
    /// 会话工作目录绝对路径。
    pub cwd: String,
    /// projectName = basename(cwd)，用于 UI 展示与 AppleScript 模糊匹配。
    pub project_name: String,
    /// 会话状态（Busy/Waiting/Idle/GitPending/Dead）。
    pub status: ClaudeSessionStatus,
    /// 会话启动时间（毫秒时间戳）。对应 json 的 `startedAt`。
    #[specta(type = Number)]
    pub started_at: i64,
    /// 最后一次状态更新时间（毫秒时间戳）。对应 json 的 `updatedAt`。
    #[specta(type = Number)]
    pub updated_at: i64,
    /// 宿主终端应用类型，决定跳转策略。
    pub host_app: TerminalApp,
    /// 宿主终端进程 pid（用于 AppleScript 间接定位）。
    pub host_pid: u32,
    /// 宿主终端的 tty 设备路径（如 `/dev/ttys004`），AppleScript 精确匹配用。
    /// 无法识别时为空字符串。
    pub tty: String,
}

// ============================================================
// 本地仓库管理：panel 窗口「本地仓库」菜单
// ============================================================

/// 本地仓库记录。持久化在 SQLite `repositories` 表（见 shared/repositories.rs）。
/// RepositoriesPage 渲染 RepositoryCard 列表的数据源。
///
/// `name` / `dir` 由用户在添加表单填写；`remote_url` / `branch` / `last_commit_*`
/// 由 `parse_repo_info` 跑 git CLI 解析，add/refresh 时写入；`updated_at` 为最近一次刷新时间。
/// 解析失败的字段留空字符串 / 0 时间戳，前端据 `card.noRemote` / `card.noCommit` 兜底文案。
#[derive(Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct Repository {
    /// 自增主键（SQLite INTEGER PRIMARY KEY）。用 i32 而非 i64：本地仓库列表规模远小于 2^31，
    /// 且 specta 禁止裸 i64 跨边界导出（BigInt 精度），i32 映射 TS number 无需 Number 注解。
    pub id: i32,
    /// 用户填写的仓库名称（展示用，可重复）。
    pub name: String,
    /// 仓库目录绝对路径（UNIQUE，严格校验须存在且为 git 仓库）。
    pub dir: String,
    /// `git remote get-url origin` 结果，无 origin 时为空字符串。
    pub remote_url: String,
    /// `git rev-parse --abbrev-ref HEAD` 结果，detached HEAD / 无提交时为空字符串。
    pub branch: String,
    /// 最近一次提交时间（毫秒时间戳，`git log -1 --format=%ct` ×1000）。无提交时为 0。
    #[specta(type = Number)]
    pub last_commit_at: i64,
    /// 最近一次提交的标题（`git log -1 --format=%s`）。无提交时为空字符串。
    pub last_commit_message: String,
    /// 本记录最近一次刷新时间（毫秒时间戳），add/refresh 时写入。
    #[specta(type = Number)]
    pub updated_at: i64,
}
