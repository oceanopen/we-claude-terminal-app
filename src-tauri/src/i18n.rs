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

pub fn menu_text(lang: ResolvedLanguage, key: &str) -> &'static str {
    match (lang, key) {
        (ResolvedLanguage::ZhCn, "settings") => "系统设置",
        (ResolvedLanguage::ZhCn, "quit") => "退出",
        (ResolvedLanguage::En, "settings") => "Settings",
        (ResolvedLanguage::En, "quit") => "Quit",
        _ => "",
    }
}
