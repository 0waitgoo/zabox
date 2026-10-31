import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, LayoutGrid, CornerDownLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { siteIconSrc, type NavGroup } from '../../data/groups';
import { searchAll } from '../../utils/search';
import { useLang } from '../../i18n/useLang';
import { displayGroupName } from '../../i18n/groupNames';
import { SiteLogo } from './Card';

/** 网页搜索引擎：回车默认引擎跟随界面语言（CN→百度，EN→Google），下拉底部两行始终可点 */
type WebEngine = 'baidu' | 'google';
const webSearchUrl = (engine: WebEngine, q: string): string =>
  engine === 'baidu'
    ? `https://www.baidu.com/s?wd=${encodeURIComponent(q)}`
    : `https://www.google.com/search?q=${encodeURIComponent(q)}`;

/**
 * 搜索（吸顶由 HomePage 的 sticky 容器负责，本组件只管搜索本身）。
 * 数据来自本地存储的当前编组：支持站点名 / 编组名 / 别名 / 拼音首字母，
 * 站点结果点击直达，编组结果点击原地展开该编组卡。
 * 一栏两模式（2026-10-30）：与 AI 整理共用顶栏一栏，平时只显示其一。
 * `active` 为 false 时本栏 display:none 藏起、但组件不卸载——搜索词保留在
 * 自己的 state 里，不会串到 AI 输入框；切回来时下拉关闭、输入框重新聚焦。
 */
export default function StickySearch({
  groups,
  onOpenGroup,
  active = true,
  onRequestActivate,
}: {
  groups: NavGroup[];
  onOpenGroup: (group: NavGroup) => void;
  /** 是否当前模式；false 时藏起（不卸载，输入内容保留） */
  active?: boolean;
  /** AI 模式下按 ⌘K/Ctrl+K 时回调：由统一栏切回搜索模式 */
  onRequestActivate?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const { lang, t } = useLang();
  const defaultEngine: WebEngine = lang === 'en' ? 'google' : 'baidu';
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const onRequestActivateRef = useRef(onRequestActivate);
  onRequestActivateRef.current = onRequestActivate;
  const prevActiveRef = useRef(active);

  /* 切到 AI 模式：关下拉；切回搜索模式：聚焦输入框（首渲染不聚焦） */
  useEffect(() => {
    const was = prevActiveRef.current;
    prevActiveRef.current = active;
    if (was === active) return;
    if (!active) setOpen(false);
    else inputRef.current?.focus();
  }, [active]);

  const results = useMemo(() => searchAll(query, groups), [query, groups]);
  const hasResults = results.sites.length > 0 || results.groups.length > 0;
  const resultCount = results.groups.length + results.sites.length;

  useEffect(() => {
    if (activeIndex >= 0) {
      document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, listId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (activeRef.current) inputRef.current?.focus();
        else onRequestActivateRef.current?.();
      }
      if (e.key === 'Escape' && !e.isComposing && activeRef.current) {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, []);

  const openSite = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  const openWebSearch = (engine: WebEngine) => {
    const q = query.trim();
    if (!q) return;
    openSite(webSearchUrl(engine, q));
  };

  const handleEnter = () => {
    if (open && activeIndex >= 0 && activeIndex < resultCount) {
      const group = results.groups[activeIndex];
      if (group) {
        onOpenGroup(group);
        setOpen(false);
      } else openSite(results.sites[activeIndex - results.groups.length].site.url);
      return;
    }
    /* 未选中本地结果：回车跳网页搜索（默认引擎跟随语言），不再直达第一个本地站点 */
    openWebSearch(defaultEngine);
  };

  return (
    <div
      ref={containerRef}
      data-search-bar
      aria-hidden={!active}
      className={`relative flex-1 min-w-0 ${active ? '' : 'hidden'}`}
    >
      <div className="relative">
        {/* 底色与 C 卡卡面同源：.card-glass-surface 走 --group-card-rgb/alpha + 同款磨砂。
            主题口径（第五十八轮收敛）：白天**不**翻白——index.css 有专门规则把本面钉回暗夜深色值，
            故本面不再挂 .group-card-scope（白天翻深文字的作用域标记）。
            下拉面板是本 div 的兄弟节点，不在作用域内，保持实色不动 */}
        <div className="card-glass-surface flex items-center gap-2 sm:gap-3 h-12 sm:h-13 px-3 sm:px-4 rounded-2xl border border-white/10 focus-within:border-indigo-400/40 transition-colors">
          <Search size={18} className="text-white/40 shrink-0" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label={t('search.aria')}
            aria-expanded={open && !!query.trim()}
            aria-controls={open && query.trim() ? listId : undefined}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(-1);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                setOpen(true);
                if (resultCount) setActiveIndex((index) =>
                  e.key === 'ArrowDown' ? (index + 1) % resultCount : (index <= 0 ? resultCount - 1 : index - 1));
              }
              if (e.key === 'Enter') {
                e.preventDefault();
                handleEnter();
              }
              if (e.key === 'Tab') setOpen(false);
            }}
            placeholder={t('search.placeholder')}
            className="flex-1 bg-transparent outline-none text-sm sm:text-base placeholder:text-white/35 min-w-0"
          />
          {query ? (
            <button
              onClick={() => { setQuery(''); setActiveIndex(-1); inputRef.current?.focus(); }}
              className="text-white/40 hover:text-white text-xs shrink-0 px-1"
            >
              {t('search.clear')}
            </button>
          ) : (
            <kbd className="hidden sm:flex items-center gap-0.5 text-[10px] text-white/40 bg-white/5 border border-white/10 rounded-md px-1.5 py-0.5 shrink-0">
              ⌘ K
            </kbd>
          )}
        </div>

        <AnimatePresence>
          {open && query.trim() && (
            <motion.div
              id={listId}
              role="listbox"
              aria-label={t('search.resultsAria')}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-2 rounded-3xl bg-[#17171d] border border-white/15 p-2 shadow-2xl shadow-black/70 max-h-[60vh] overflow-y-auto z-50"
            >
              {!hasResults && (
                <div className="px-4 py-6 text-center text-sm text-white/55">{t('search.empty')}</div>
              )}

              {results.groups.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wider text-white/50 uppercase">{t('search.groupsHeading')}</p>
                  {results.groups.map((group, index) => (
                    <button
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={activeIndex === index}
                      tabIndex={-1}
                      style={activeIndex === index ? { backgroundColor: 'rgba(255,255,255,0.08)' } : undefined}
                      key={group.id}
                      onClick={() => {
                        onOpenGroup(group);
                        setOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-white/8 text-left transition-colors"
                    >
                      <span className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center shrink-0">
                        <LayoutGrid size={15} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium truncate">{displayGroupName(group, lang)}</span>
                        <span className="block text-[11px] text-white/55">{t('search.sitesInGroup', { n: group.sites.length })}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {results.sites.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wider text-white/50 uppercase">{t('search.sitesHeading')}</p>
                  {results.sites.map(({ site, group, matchedAlias }, index) => (
                    <button
                      id={`${listId}-${results.groups.length + index}`}
                      role="option"
                      aria-selected={activeIndex === results.groups.length + index}
                      tabIndex={-1}
                      style={activeIndex === results.groups.length + index ? { backgroundColor: 'rgba(255,255,255,0.08)' } : undefined}
                      key={`${group.id}-${site.name}`}
                      onClick={() => openSite(site.url)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-white/8 text-left transition-colors group/item"
                    >
                      <SiteLogo logo={siteIconSrc(site)} name={site.name} url={site.url} size={32} imgSize={22} />
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium truncate">{site.name}</span>
                          {matchedAlias && (
                            <span className="text-[9px] font-medium text-indigo-300 bg-indigo-500/20 px-1.5 py-0.5 rounded shrink-0">
                              {t('search.alias', { alias: matchedAlias })}
                            </span>
                          )}
                          {site.dead && (
                            <span className="text-[9px] font-medium text-red-300 bg-red-500/15 px-1.5 py-0.5 rounded shrink-0">{t('search.invalid')}</span>
                          )}
                        </span>
                        <span className="block text-[11px] text-white/55 truncate">{site.description}</span>
                      </span>
                      <span className="text-[11px] text-white/45 shrink-0 hidden sm:flex items-center gap-1">
                        {displayGroupName(group, lang)}
                        <CornerDownLeft size={11} className="opacity-0 group-hover/item:opacity-60" />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-1 border-t border-white/10 pt-1">
                <p className="px-3 pt-1.5 pb-1 text-[10px] font-medium tracking-wider text-white/50 uppercase">{t('search.webHeading')}</p>
                {(['baidu', 'google'] as WebEngine[]).map((engine) => (
                  <button
                    key={engine}
                    onClick={() => openWebSearch(engine)}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-2xl hover:bg-white/8 text-left transition-colors"
                  >
                    <span className="w-8 h-8 rounded-lg bg-white/8 text-white/70 flex items-center justify-center shrink-0">
                      <Search size={15} />
                    </span>
                    <span className="flex-1 min-w-0 truncate text-sm">
                      {t('search.searchOn', { engine: engine === 'baidu' ? 'Baidu' : 'Google', q: query.trim() })}
                    </span>
                    {engine === defaultEngine && (
                      <span className="text-[9px] font-medium text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded shrink-0">
                        {t('search.defaultEngine')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
