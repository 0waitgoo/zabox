import React, { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { toolsByCategory, type NavPoolSite } from '../../data/navPool';
import type { NavGroup } from '../../data/groups';
import { useLang } from '../../i18n/useLang';
import { displayPoolCategory } from '../../i18n/groupNames';
import { SiteLogo } from './Card';

/**
 * 在杂盒里找（加站二选一的第二路）：把导航页整份站点池（toolsByCategory，21 类 185 站）
 * 按分类列表展示，用户自己勾选、可多选，点「加入所选」一次性全部加进当前组。
 * 已在组内的站（按网址去尾斜杠比对）置灰并标「已在组内」，不可重复勾选——
 * store.addSite 本身不去重，重复加入只能在这里拦。
 */
function normalizeUrl(url: string) {
  return url.replace(/\/+$/, '');
}

export default function SitePoolPicker({
  group,
  onAdd,
  onBack,
  onClose,
}: {
  group: NavGroup;
  onAdd: (sites: NavPoolSite[]) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const { t, lang } = useLang();
  const existing = useMemo(() => new Set(group.sites.map((s) => normalizeUrl(s.url))), [group]);
  const q = query.trim().toLowerCase();
  const sections = useMemo(
    () =>
      Object.entries(toolsByCategory)
        .map(([category, sites]) => ({
          category,
          sites: q
            ? sites.filter((s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
            : sites,
        }))
        .filter((sec) => sec.sites.length > 0),
    [q],
  );
  // 确认时按池子原顺序加入（不按勾选顺序），组内顺序稳定可预期
  const selectedSites = useMemo(
    () => Object.values(toolsByCategory).flat().filter((s) => selected.has(s.url)),
    [selected],
  );
  const total = Object.values(toolsByCategory).reduce((n, sites) => n + sites.length, 0);
  const toggle = (site: NavPoolSite) => {
    if (existing.has(normalizeUrl(site.url))) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(site.url)) next.delete(site.url);
      else next.add(site.url);
      return next;
    });
  };

  return (
    <div data-pool-picker className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-medium shrink-0">{t('menu.findInBox')}</span>
        <span className="text-[11px] text-white/35 shrink-0">{t('menu.siteTotal', { n: total })}</span>
        <button
          data-pool-cancel
          onClick={onClose}
          className="ml-auto text-[11px] text-white/50 hover:text-white/85 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors shrink-0"
        >
          {t('menu.cancel')}
        </button>
      </div>

      <div className="relative mt-2">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        <input
          data-pool-search
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('menu.poolSearchPlaceholder')}
          className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-[12px] outline-none focus:border-indigo-400/60 placeholder:text-white/25"
        />
      </div>

      <div className="mt-2 max-h-[320px] overflow-y-auto pr-1 -mr-1">
        {sections.length === 0 ? (
          <p className="text-[12px] text-white/35 py-6 text-center">{t('menu.poolEmpty')}</p>
        ) : (
          sections.map((sec) => (
            <div key={sec.category} className="mt-2 first:mt-0">
              <div className="text-[11px] font-medium text-white/45 px-1 py-1">
                {displayPoolCategory(sec.category, lang)}（{sec.sites.length}）
              </div>
              <div className="flex flex-col gap-1">
                {sec.sites.map((site) => {
                  const inGroup = existing.has(normalizeUrl(site.url));
                  const checked = selected.has(site.url);
                  return (
                    <button
                      key={site.url}
                      type="button"
                      data-pool-site={site.url}
                      disabled={inGroup}
                      onClick={() => toggle(site)}
                      className={`flex items-center gap-2.5 w-full text-left px-2 py-1.5 rounded-xl border transition-colors ${
                        inGroup
                          ? 'border-white/5 bg-white/[0.02] opacity-50 cursor-default'
                          : checked
                            ? 'border-indigo-400/60 bg-indigo-500/15'
                            : 'border-white/5 bg-white/[0.03] hover:border-white/20'
                      }`}
                    >
                      <SiteLogo logo={site.logo} name={site.name} url={site.url} size={30} imgSize={21} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] font-medium truncate">{site.name}</span>
                        <span className="block text-[11px] text-white/40 truncate">{site.description}</span>
                      </span>
                      {site.needVpn && (
                        <span className="text-[9px] font-medium text-amber-300 bg-amber-500/15 px-1 py-px rounded shrink-0">VPN</span>
                      )}
                      {inGroup ? (
                        <span className="text-[11px] text-white/35 shrink-0">{t('menu.inGroup')}</span>
                      ) : (
                        <span
                          className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                            checked ? 'border-indigo-400 bg-indigo-500 text-white' : 'border-white/25 text-transparent'
                          }`}
                        >
                          <Check size={12} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          data-pool-back
          onClick={onBack}
          className="px-3 py-1.5 rounded-xl bg-white/10 text-[12px] text-white/70 hover:text-white transition-colors"
        >
          {t('menu.back')}
        </button>
        <button
          data-pool-confirm
          disabled={selectedSites.length === 0}
          onClick={() => onAdd(selectedSites)}
          className="flex-1 px-3 py-1.5 rounded-xl bg-indigo-500/80 text-[12px] font-medium text-white disabled:opacity-40 disabled:cursor-default transition-colors"
        >
          {t('menu.addSelected', { n: selectedSites.length })}
        </button>
      </div>
    </div>
  );
}
