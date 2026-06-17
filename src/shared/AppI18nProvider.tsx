import type { Language, ResolvedLanguage } from './config';
import { listen } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import {
  DEFAULT_LANGUAGE,
  getConfig,
  LANGUAGE_KEY,
} from './config';
import i18n from './i18n';
import { useSystemLanguage } from './useSystemLanguage';

interface Props {
  children: React.ReactNode;
}

function isLanguage(v: string | null): v is Language {
  return v === 'system' || v === 'zh-CN' || v === 'en';
}

function applyLanguage(resolved: ResolvedLanguage) {
  if (i18n.language !== resolved) {
    void i18n.changeLanguage(resolved);
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = resolved;
  }
}

export default function AppI18nProvider({ children }: Props) {
  const [language, setLanguage] = useState<Language>(DEFAULT_LANGUAGE);
  const systemLanguage = useSystemLanguage();

  useEffect(() => {
    getConfig(LANGUAGE_KEY).then((v) => {
      if (isLanguage(v)) {
        setLanguage(v);
      }
    });
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<{ key: string; value: string }>(
      'config-changed',
      (e) => {
        if (e.payload.key === LANGUAGE_KEY && isLanguage(e.payload.value)) {
          setLanguage(e.payload.value);
        }
      },
    );
    return () => {
      unlistenPromise.then(fn => fn());
    };
  }, []);

  const resolved: ResolvedLanguage
    = language === 'system' ? systemLanguage : language;

  useEffect(() => {
    applyLanguage(resolved);
  }, [resolved]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
