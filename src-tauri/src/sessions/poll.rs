// 兜底轮询：每 N 秒全量 rescan 一次，驱动 Dead 老化 + 兜底 watcher 漏报。
//
// 与原 monitor.rs::start_poller 同模式（独立线程 + sleep 循环）。
// 即时性由 watcher 负责，本常量只驱动老化与漏报兜底，粗粒度即可。

use std::time::Duration;

use tauri::AppHandle;

use crate::sessions::store;

/// 兜底轮询周期。5s 平衡老化时效与 CPU 开销。
const RESCAN_POLL_INTERVAL_SECS: u64 = 5;

/// 启动兜底轮询后台线程。线程生命周期与进程一致。
pub fn start(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(RESCAN_POLL_INTERVAL_SECS));
        store::rescan(&app);
    });
}
