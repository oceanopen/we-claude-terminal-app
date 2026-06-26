use sys_locale::get_locale;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ResolvedLanguage {
    ZhCn,
    En,
}

fn detect_system_language() -> ResolvedLanguage {
    match get_locale() {
        Some(locale) if locale.to_lowercase().starts_with("zh") => ResolvedLanguage::ZhCn,
        _ => ResolvedLanguage::En,
    }
}

pub fn resolve(raw: Option<&str>) -> ResolvedLanguage {
    match raw {
        Some("zh-CN") => ResolvedLanguage::ZhCn,
        Some("en") => ResolvedLanguage::En,
        _ => detect_system_language(),
    }
}

/// 后端文案仅覆盖托盘菜单（业务文案在前端 react-i18next）。
/// 加 key 时同步 refresh_menu_texts 与 setup 的菜单构建。
pub fn menu_text(lang: ResolvedLanguage, key: &str) -> &'static str {
    match (lang, key) {
        (ResolvedLanguage::ZhCn, "monitor") => "终端监听",
        (ResolvedLanguage::ZhCn, "settings") => "系统设置",
        (ResolvedLanguage::ZhCn, "pet-show") => "显示桌宠",
        (ResolvedLanguage::ZhCn, "pet-hide") => "隐藏桌宠",
        (ResolvedLanguage::ZhCn, "quit") => "退出",
        (ResolvedLanguage::En, "monitor") => "Terminal Monitor",
        (ResolvedLanguage::En, "settings") => "Settings",
        (ResolvedLanguage::En, "pet-show") => "Show Pet",
        (ResolvedLanguage::En, "pet-hide") => "Hide Pet",
        (ResolvedLanguage::En, "quit") => "Quit",
        _ => "",
    }
}
