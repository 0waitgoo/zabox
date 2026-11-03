import { X } from 'lucide-react';
import type { LocalStore } from '../../store/localStore';
import { useDisplayPrefs } from '../../store/displayPrefs';
import { useLang } from '../../i18n/useLang';
import { siteIconSrc, type SiteEntry } from '../../data/groups';
import { SiteLogo } from './Card';

/**
 * 底部 Dock 栏（2026-11-04 用户定，参考另一新标签页底部的居中 Dock）：
 * 固定在主页底部居中，开关在预设面板「外观」节（只存本机显示偏好，默认开）。
 * 内容是 store.data.dock 里的引用：渲染时按组 id 解析、组内先按站点 id 再按 url
 * 找实时站点数据（预设模板会重配站点 id，url 才是跨预设的稳定键）——
 * 拖网站进来只追加引用，主页编组与站点原样不动，同一网站同时在主页与 Dock 出现；
 * 主页删站后引用自动跳过、改名换图标后 Dock 里同步变。点 Dock 图标打开网站，
 * 悬停的 × 只从 Dock 移除引用，不动主页。
 * 图标与页面保持一致：渲染完整站点条目，走与列表行/瓷砖同一条管线——
 * siteIconSrc（文字图标/自传图标/品牌 logo）+ SiteLogo（会话缓存与回落链），
 * 绝不直接用 site.logo（文字/自传图标会走样）。
 */
export default function DockBar({ store }: { store: LocalStore }) {
  const { t } = useLang();
  const { dockVisible } = useDisplayPrefs();
  if (!dockVisible) return null;

  const resolved: {
    entryGroupId: string;
    entrySiteId: string;
    entryUrl: string;
    site: SiteEntry;
  }[] = [];
  const seen = new Set<string>();
  for (const entry of store.data.dock ?? []) {
    const group = store.data.groups.find((g) => g.id === entry.groupId);
    // 先按 siteId、再按 url 解析：切预设后模板会重配站点 id，url 才是稳定键
    const site =
      group?.sites.find((s) => s.id === entry.siteId) ??
      group?.sites.find((s) => !!entry.url && s.url === entry.url);
    if (!site) continue;
    const dedupeKey = `${entry.groupId}|${site.url}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    resolved.push({ entryGroupId: entry.groupId, entrySiteId: entry.siteId, entryUrl: entry.url, site });
  }

  return (
    <div
      data-dock-bar
      className="fixed bottom-3 sm:bottom-5 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1 sm:gap-1.5 rounded-[28px] border border-white/10 bg-[#14141a]/70 px-2.5 py-2 shadow-2xl shadow-black/60 backdrop-blur-md max-w-[calc(100vw-20px)] overflow-x-auto"
    >
      {resolved.length === 0 ? (
        <p data-dock-empty className="px-3 py-1.5 text-xs text-white/55 whitespace-nowrap">
          {t('dock.empty')}
        </p>
      ) : (
        resolved.map((item) => (
          <div key={`${item.entryGroupId}|${item.site.id ?? item.entrySiteId}`} className="group relative shrink-0">
            <button
              type="button"
              data-dock-item={item.site.id ?? item.entrySiteId}
              title={item.site.name}
              aria-label={item.site.name}
              onClick={() => window.open(item.site.url, '_blank')}
              className="flex w-[58px] flex-col items-center gap-1 rounded-2xl px-1 py-1 transition-colors hover:bg-white/8"
            >
              <SiteLogo
                logo={siteIconSrc(item.site)}
                name={item.site.name}
                url={item.site.url}
                size={44}
                grayscale={!!item.site.dead}
              />
              <span className="w-full truncate text-center text-[10px] leading-tight text-white/80">{item.site.name}</span>
            </button>
            <button
              type="button"
              data-dock-remove={item.site.id ?? item.entrySiteId}
              title={t('dock.remove')}
              aria-label={t('dock.remove')}
              onClick={(e) => {
                e.stopPropagation();
                store.removeDockSite(item.entryGroupId, item.entrySiteId, item.entryUrl);
              }}
              className="absolute -top-1 -right-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/70 text-white/70 ring-1 ring-white/25 opacity-0 transition-opacity hover:text-white group-hover:opacity-100 focus-visible:opacity-100"
            >
              <X size={11} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
