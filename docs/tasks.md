### 后续可选优化

- **桌宠视觉升级**：替换 emoji 为 SVG/Lottie 动画
- **扩展 IDE 终端**：在 `terminal/` 域加 `vscode.rs` / `intellij.rs`，dispatch 加分支
- **跨平台支持**：在 `terminal/mod.rs` 加平台 cfg 分支，Windows/Linux 走 shell 启动新终端
- **会话过滤**：监控窗口加状态筛选 Tab（如"仅显示 Busy"）
- **桌宠持久化位置**：将拖拽后位置存 config，下次启动恢复
