import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, LayoutGrid, CornerDownLeft } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { siteIconSrc, type NavGroup } from '../../data/groups';
import { searchAll } from '../../utils/search';
import { SiteLogo } from './Card';

/**
 * 搜索（吸顶由 HomePage 的 sticky 容器负责，本组件只管搜索本身）。
 * 数据来自本地存储的当前编组：支持站点名 / 编组名 / 别名 / 拼音首字母，
 * 站点结果点击直达，编组结果点击原地展开该编组卡。
 */
export default function StickySearch({
  groups,
  onOpenGroup,
}: {
  groups: NavGroup[];
  onOpenGroup: (group: NavGroup) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
        inputRef.current?.focus();
      }
      if (e.key === 'Escape' && !e.isComposing) {
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

  const handleEnter = () => {
    if (open && activeIndex >= 0 && activeIndex < resultCount) {
      const group = results.groups[activeIndex];
      if (group) {
        onOpenGroup(group);
        setOpen(false);
      } else openSite(results.sites[activeIndex - results.groups.length].site.url);
      return;
    }
    const first = results.sites[0];
    if (first) openSite(first.site.url);
    else if (results.groups[0]) {
      onOpenGroup(results.groups[0]);
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0">
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
            aria-label="搜索网站和编组"
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
            placeholder="搜索网站、编组…试试拼音首字母或别名，如 db / gpt"
            className="flex-1 bg-transparent outline-none text-sm sm:text-base placeholder:text-white/35 min-w-0"
          />
          {query ? (
            <button
              onClick={() => { setQuery(''); setActiveIndex(-1); inputRef.current?.focus(); }}
              className="text-white/40 hover:text-white text-xs shrink-0 px-1"
            >
              清除
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
              aria-label="搜索结果"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 right-0 top-full mt-2 rounded-3xl bg-[#17171d] border border-white/15 p-2 shadow-2xl shadow-black/70 max-h-[60vh] overflow-y-auto z-50"
            >
              {!hasResults && (
                <div className="px-4 py-6 text-center text-sm text-white/55">没有找到相关站点或编组</div>
              )}

              {results.groups.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wider text-white/50 uppercase">编组</p>
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
                        <span className="block text-sm font-medium truncate">{group.name}</span>
                        <span className="block text-[11px] text-white/55">{group.sites.length} 个站点 · 点击展开编组</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {results.sites.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-medium tracking-wider text-white/50 uppercase">站点 · 回车直达第一个</p>
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
                              别名 · {matchedAlias}
                            </span>
                          )}
                          {site.dead && (
                            <span className="text-[9px] font-medium text-red-300 bg-red-500/15 px-1.5 py-0.5 rounded shrink-0">失效</span>
                          )}
                        </span>
                        <span className="block text-[11px] text-white/55 truncate">{site.description}</span>
                      </span>
                      <span className="text-[11px] text-white/45 shrink-0 hidden sm:flex items-center gap-1">
                        {group.name}
                        <CornerDownLeft size={11} className="opacity-0 group-hover/item:opacity-60" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
