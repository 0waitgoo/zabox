/**
 * 左侧悬浮组（2026-11-05 用户定）：名叫 tab 的编组——扩展弹窗与右键添加的落点——
 * 在宽屏下不占组卡，改在左侧悬浮条里显示；组里没有站点时整个条隐藏；
 * 窄屏与移动端沿用普通组卡（HomePage 里按同名过滤只在宽屏生效）。
 *
 * 悬浮组是临时落点（2026-11-05 用户定）：行按住拖出即移动——拖到组卡上进那个组、
 * 拖到 Dock 栏进 Dock（带图标快照、因原站已删、引用无处解析），两种落点都会把
 * 原站从悬浮组删除；拖回原处/空白处取消。拖拽走 useSiteDragSort 跨组模式（与搜索下拉同口径）。
 */
import { siteIconSrc, TAB_GROUP_NAME, type NavGroup } from '../../data/groups';
import type { LocalStore } from '../../store/localStore';
import { dockSiteSnapshot } from '../../store/localStore';
import { SiteLogo } from './Card';
import { useSiteDragSort } from './useSiteDragSort';

export function findTabGroup(groups: NavGroup[]): NavGroup | undefined {
  return groups.find((g) => g.name === TAB_GROUP_NAME);
}

export default function FloatingTabGroup({ store }: { store: LocalStore }) {
  const group = findTabGroup(store.data.groups);
  const sites = group?.sites ?? [];
  const siteDrag = useSiteDragSort({
    sites,
    crossGroupOnly: true,
    groupId: group?.id,
    onMoveToGroup: (siteId, targetGroupId) => {
      if (group) store.moveSite(group.id, siteId, targetGroupId);
    },
    onDropToDock: (siteId) => {
      const site = sites.find((s) => s.id === siteId);
      if (!group || !site) return;
      store.addDockSite(group.id, siteId, site.url, dockSiteSnapshot(site));
      store.deleteSite(group.id, siteId);
    },
    onDropToTrash: (siteId) => {
      if (group) store.deleteSite(group.id, siteId);
    },
  });
  if (!group || group.sites.length === 0) return null;
  return (
    <aside
      data-floating-tab-group
      data-cross-source
      aria-label={group.name}
      onPointerDown={siteDrag.onContainerPointerDown}
      onDragStart={siteDrag.onContainerDragStart}
      className="fixed left-4 top-1/2 z-30 w-[232px] max-h-[calc(100vh-32px)] -translate-y-1/2 overflow-y-auto rounded-[20px] border border-white/10 bg-[#14141a]/70 p-2 backdrop-blur-md"
    >
      {siteDrag.items.map((site) => (
        <button
          key={site.id}
          type="button"
          data-site-drag-id={site.id}
          draggable={false}
          title={site.url}
          onClick={() => {
            if (siteDrag.consumeSuppressClick()) return;
            window.open(site.url, '_blank');
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm text-white/90 hover:bg-white/10"
        >
          <SiteLogo logo={siteIconSrc(site)} name={site.name} url={site.url} size={22} grayscale={site.dead} />
          <span className="min-w-0 flex-1 truncate">{site.name}</span>
        </button>
      ))}
      {siteDrag.dragLayer}
    </aside>
  );
}
