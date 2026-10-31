import { useSyncExternalStore } from 'react';
import { loadLang, saveLang, translate, type Lang } from './strings';

/**
 * 语言状态（模块级单例 + useSyncExternalStore）：
 * - 不用 Context 透传：任意深度的组件直接 useLang() 即可，切换时全树重渲染；
 * - 同源多标签页通过 storage 事件同步语言（与本地存储监听同一路子）。
 */

let current: Lang = loadLang();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((cb) => cb());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getSnapshot(): Lang {
  return current;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === 'zabox-lang') {
      const next = loadLang();
      if (next !== current) {
        current = next;
        emit();
      }
    }
  });
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  saveLang(lang);
  emit();
}

export function useLang(): { lang: Lang; setLang: (lang: Lang) => void; t: (key: string, vars?: Record<string, string | number>) => string } {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { lang, setLang, t: (key, vars) => translate(lang, key, vars) };
}
