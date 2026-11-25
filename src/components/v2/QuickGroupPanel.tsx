/**
 * 快速组搜集面板（2026-11-26 用户令）：主页顶部小按钮点开展开的浮动面板，
 * 无全屏遮罩（遮罩会挡住底下的组卡、拖拽就落不到组上），面板挂在按钮行下方居中。
 *
 * 拖进自己的组（核心）：复用 FloatingTabGroup 的 useSiteDragSort 跨组模式
 * （crossGroupOnly，按住拖出即跨组、落组卡上进组、落空白处取消，拖完那次点击
 * 被 consumeSuppressClick 吃掉）。区别是快速组站点是「虚拟」的、不在 store 里：
 * 每站一个合成 id `quick:<groupId>:<index>`，useSiteDragSort 的 sites 参数就传这组
 * 虚拟站；onMoveToGroup 时不调 store.moveSite（站不在任何组里、没得移），而是按
 * 合成 id 找到对应快速站、调 store.addSite 把它加进目标组；拖完站仍留在快速组里，
 * 可反复加进多个组。不接 Dock、不接垃圾桶。
 *
 * 整组添加：store.addGroup(组名, 'list') 拿新组 id，再逐个 store.addSite（按归一化
 * url 与用户已有全部站点去重，已有的跳过）；新组不用手动写 cardOrder——
 * defaultOrder 由全部组构成、resolveCardOrder 会把未进 cardOrder 的组追加在末尾，
 * 放置引擎再回落到最矮栏（见 laneLayout.ts），加完主页上直接出现。
 */
import { useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { autoSiteLogo, siteIconSrc, type SiteEntry } from '../../data/groups';
import type { QuickGroup, QuickGroupSite } from '../../data/quickGroups';
import type { LocalStore, SiteDraft } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import { SiteLogo } from './Card';
import { useSiteDragSort } from './useSiteDragSort';

/** 站点 url 归一化（去重用）：去协议、去尾斜杠、小写（与 localStore.replaceGroups 同口径） */
const normUrl = (u: string) => u.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();

/** 面板瓷砖定位用：url 去协议、小写（data-quick-site） */
const siteKey = (u: string) => u.replace(/^https?:\/\//i, '').toLowerCase();

/** 快速站 → 落盘用的 SiteDraft（addSite 内部按 name/url 自动取图标，见 logoForSite） */
const draftFor = (site: QuickGroupSite): SiteDraft => ({
  name: site.name,
  url: site.url,
  description: site.desc ?? '',
  tags: [],
  aliases: [],
  pinned: false,
  iconMode: 'auto',
  iconText: '',
  iconColor: '',
  iconImage: '',
  autoLogo: '',
});

export default function QuickGroupPanel({
  group,
  store,
  onClose,
}: {
  group: QuickGroup;
  store: LocalStore;
  onClose: () => void;
}) {
  const { t, lang } = useLang();

  /** 虚拟站（SiteEntry 形状，与 useSiteDragSort 兼容）+ 合成 id → 快速站映射 */
  const { virtualSites, byId } = useMemo(() => {
    const byId = new Map<string, QuickGroupSite>();
    const virtualSites: SiteEntry[] = group.sites.map((s, i) => {
      const id = `quick:${group.id}:${i}`;
      byId.set(id, s);
      return {
        id,
        name: s.name,
        url: s.url,
        description: s.desc ?? '',
        logo: autoSiteLogo(s.name, s.url),
        frequency: 0,
      };
    });
    return { virtualSites, byId };
  }, [group]);

  const siteDrag = useSiteDragSort({
    sites: virtualSites,
    crossGroupOnly: true,
    onMoveToGroup: (siteId, targetGroupId) => {
      const quick = byId.get(siteId);
      if (!quick) return;
      store.addSite(targetGroupId, draftFor(quick));
    },
  });

  /** Esc 关闭面板；拖动中的 Esc 交给 useSiteDragSort 取消拖动（拖动快照存在时不关面板） */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (document.querySelector('[data-drag-clone]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /** 整组添加：新建同名组（同名也不拦），逐个加站（归一化 url 去重），加完关面板 */
  const addWholeGroup = () => {
    const gid = store.addGroup(group.name, 'list');
    const seen = new Set<string>();
    for (const g of store.data.groups) for (const s of g.sites) seen.add(normUrl(s.url));
    for (const s of group.sites) {
      const key = normUrl(s.url);
      if (seen.has(key)) continue;
      seen.add(key);
      store.addSite(gid, draftFor(s));
    }
    onClose();
  };

  return (
    <div
      data-quick-group-panel={group.id}
      data-cross-source
      onPointerDown={siteDrag.onContainerPointerDown}
      onDragStart={siteDrag.onContainerDragStart}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="absolute left-1/2 top-full z-50 mt-2 w-[min(680px,calc(100vw-32px))] -translate-x-1/2 rounded-[20px] border border-white/10 bg-[#14141a]/95 p-3 shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-center gap-2 px-1 pb-2">
        <h3 className="text-sm font-semibold text-white">{lang === 'en' ? group.nameEn : group.name}</h3>
        <span className="min-w-0 flex-1 truncate text-[11px] leading-4 text-white/45">{t('quick.dragHint')}</span>
        <button
          type="button"
          data-quick-add-all
          onClick={addWholeGroup}
          className="shrink-0 rounded-full bg-indigo-500/90 px-2.5 py-1 text-xs text-white hover:bg-indigo-500"
        >
          {t('quick.addAll')}
        </button>
        <button
          type="button"
          data-quick-close
          onClick={onClose}
          aria-label={t('quick.close')}
          className="shrink-0 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
      <div className="grid max-h-[min(56vh,420px)] grid-cols-2 gap-1.5 overflow-y-auto pr-0.5 sm:grid-cols-3">
        {siteDrag.items.map((site) => {
          const quick = byId.get(site.id ?? '');
          return (
            <button
              key={site.id}
              type="button"
              data-site-drag-id={site.id}
              data-quick-site={siteKey(site.url)}
              draggable={false}
              title={site.url}
              onClick={() => {
                if (siteDrag.consumeSuppressClick()) return;
                window.open(site.url, '_blank');
              }}
              className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-white/10"
            >
              <SiteLogo logo={siteIconSrc(site)} name={site.name} url={site.url} size={28} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm text-white/90">
                  <span className="truncate">{site.name}</span>
                  {quick?.ad && (
                    <span
                      data-quick-ad
                      className="shrink-0 rounded bg-amber-400/20 px-1 py-px text-[10px] leading-4 text-amber-300"
                    >
                      {t('quick.ad')}
                    </span>
                  )}
                </span>
                <span className="block truncate text-[11px] leading-4 text-white/45">{site.description}</span>
              </span>
            </button>
          );
        })}
      </div>
      {siteDrag.dragLayer}
    </div>
  );
}
