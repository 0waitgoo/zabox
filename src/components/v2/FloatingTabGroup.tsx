/**
 * 左侧悬浮组（2026-11-05 用户定）：名叫 tab 的编组——扩展弹窗与右键添加的落点——
 * 在宽屏下不占组卡，改在左侧悬浮条里显示；组里没有站点时整个条隐藏；
 * 窄屏与移动端沿用普通组卡（HomePage 里按同名过滤只在宽屏生效）。
 * 只负责展示与点开：增删改仍走组卡/扩展添加，不另设入口。
 */
import { siteIconSrc, TAB_GROUP_NAME, type NavGroup } from '../../data/groups';
import type { LocalStore } from '../../store/localStore';
import { SiteLogo } from './Card';

export function findTabGroup(groups: NavGroup[]): NavGroup | undefined {
  return groups.find((g) => g.name === TAB_GROUP_NAME);
}

export default function FloatingTabGroup({ store }: { store: LocalStore }) {
  const group = findTabGroup(store.data.groups);
  if (!group || group.sites.length === 0) return null;
  return (
    <aside
      data-floating-tab-group
      aria-label={group.name}
      className="fixed left-4 top-[76px] z-30 w-[232px] max-h-[calc(100vh-96px)] overflow-y-auto rounded-[20px] border border-white/10 bg-[#14141a]/70 p-2 backdrop-blur-md"
    >
      {group.sites.map((site) => (
        <button
          key={site.id}
          type="button"
          title={site.url}
          onClick={() => window.open(site.url, '_blank')}
          className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-sm text-white/90 hover:bg-white/10"
        >
          <SiteLogo logo={siteIconSrc(site)} name={site.name} url={site.url} size={30} grayscale={site.dead} />
          <span className="min-w-0 flex-1 truncate">{site.name}</span>
        </button>
      ))}
    </aside>
  );
}
