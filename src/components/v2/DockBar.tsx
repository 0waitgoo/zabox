import React from 'react';
import { createPortal } from 'react-dom';
import { Check, MoreHorizontal, Trash2 } from 'lucide-react';
import type { DockEntry, LocalStore } from '../../store/localStore';
import { setDisplayPrefs, useDisplayPrefs, type DockHide, type DockSize } from '../../store/displayPrefs';
import { useLang } from '../../i18n/useLang';
import { siteIconSrc, type SiteEntry } from '../../data/groups';
import { SiteLogo } from './Card';

/**
 * 底部 Dock 栏（2026-11-04 用户定，参考另一新标签页底部的居中 Dock）：
 * 固定在主页底部居中，开关在预设面板「外观」节（只存本机显示偏好，默认开）。
 * 内容是 store.data.dock 里的引用：渲染时按组 id 解析、组内先按站点 id 再按 url
 * 找实时站点数据（预设模板会重配站点 id，url 才是跨预设的稳定键）——
 * 拖网站进来只追加引用，主页编组与站点原样不动，同一网站同时在主页与 Dock 出现；
 * 主页删站后引用自动跳过、改名换图标后 Dock 里同步变。点 Dock 图标打开网站。
 * 图标与页面保持一致：渲染完整站点条目，走与列表行/瓷砖同一条管线——
 * siteIconSrc（文字图标/自传图标/品牌 logo）+ SiteLogo（会话缓存与回落链），
 * 绝不直接用 site.logo（文字/自传图标会走样）。
 *
 * 删除与排序（2026-11-04 用户定）：悬停 × 已删——右键出菜单删除，或把图标
 * 拖出 Dock 栏松手删除；左右拖动改变位置。三种操作都只改 dock 引用数组，
 * 主页数据一概不动。
 *
 * 名字与设置（2026-11-04 用户定）：Dock 里只显示图标、不显示名字（悬停看
 * 原生 title）；栏右端一个 ⋮ 按钮开设置面板：隐藏三态（一直显示 / 自动隐藏 /
 * 一直隐藏）与大小三档（小 / 中 / 大），都只存本机显示偏好。自动隐藏时鼠标
 * 贴到底边浮现、离开后收起；一直隐藏时只剩 ⋮ 钮可改回（主开关在预设面板）。
 */
type DockSizeConfig = { icon: number; btn: number; btnClass: string; padClass: string };

const DOCK_SIZES: Record<DockSize, DockSizeConfig> = {
  s: { icon: 32, btn: 46, btnClass: 'w-[46px]', padClass: 'px-2 py-1.5' },
  m: { icon: 44, btn: 58, btnClass: 'w-[58px]', padClass: 'px-2.5 py-2' },
  l: { icon: 56, btn: 70, btnClass: 'w-[70px]', padClass: 'px-3 py-2.5' },
};
type ResolvedDockItem = {
  key: string;
  entryGroupId: string;
  entrySiteId: string;
  entryUrl: string;
  site: SiteEntry;
};

type DragState = {
  key: string;
  x: number;
  y: number;
  outside: boolean;
  order: string[];
};

export default function DockBar({ store }: { store: LocalStore }) {
  const { t } = useLang();
  const { dockVisible, dockSize, dockHide } = useDisplayPrefs();
  const size = DOCK_SIZES[dockSize] ?? DOCK_SIZES.m;
  const barRef = React.useRef<HTMLDivElement | null>(null);
  const itemEls = React.useRef(new Map<string, HTMLElement>());
  const suppressClickRef = React.useRef<string | null>(null);
  const [drag, setDrag] = React.useState<DragState | null>(null);
  const [menu, setMenu] = React.useState<{ x: number; y: number; key: string } | null>(null);
  const menuRef = React.useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const settingsRef = React.useRef<HTMLDivElement | null>(null);
  const [autoVisible, setAutoVisible] = React.useState(false);
  const dragActiveRef = React.useRef(false);
  const hideTimerRef = React.useRef<number | null>(null);

  // 自动隐藏：鼠标贴到底边 16px 内浮现
  React.useEffect(() => {
    if (dockHide !== 'auto') return;
    const onMove = (e: MouseEvent) => {
      if (e.clientY > window.innerHeight - 16) setAutoVisible(true);
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [dockHide]);

  const resolved: ResolvedDockItem[] = [];
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
    resolved.push({
      key: `${entry.groupId}|${site.id ?? entry.siteId}`,
      entryGroupId: entry.groupId,
      entrySiteId: entry.siteId,
      entryUrl: entry.url,
      site,
    });
  }
  const byKey = new Map(resolved.map((item) => [item.key, item]));
  const ordered =
    drag && drag.order.every((k) => byKey.has(k))
      ? drag.order.map((k) => byKey.get(k)!)
      : resolved;
  const draggedItem = drag ? byKey.get(drag.key) : undefined;

  // 右键菜单：点菜单外 / Esc 即关（栏是 fixed 定位，滚动不挪位，不用滚动关）
  React.useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  // 设置面板：点面板与 ⋮ 钮之外 / Esc 即关（面板锚定 fixed 的栏，滚动不挪位，不用滚动关）
  React.useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (settingsRef.current && !settingsRef.current.contains(target)) {
        if (!settingsBtnRef.current || !settingsBtnRef.current.contains(target)) setSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  if (!dockVisible) return null;

  // 自动隐藏：栏在视口内才算显示；设置面板/右键菜单/拖拽进行时保持显示
  const barShown = dockHide === 'show' || autoVisible || settingsOpen || !!drag || !!menu;

  const clearAutoHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleAutoHide = () => {
    if (dockHide !== 'auto') return;
    clearAutoHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      if (dragActiveRef.current) return;
      if (document.querySelector('[data-dock-settings-panel], [data-dock-menu]')) return;
      setAutoVisible(false);
    }, 350);
  };

  const isOutsideBar = (clientX: number, clientY: number) => {
    const bar = barRef.current?.getBoundingClientRect();
    if (!bar) return true;
    const slack = 8;
    return (
      clientY < bar.top - slack ||
      clientY > bar.bottom + slack ||
      clientX < bar.left - slack ||
      clientX > bar.right + slack
    );
  };

  const startDrag = (e: React.PointerEvent, item: ResolvedDockItem) => {
    if (e.button !== 0) return;
    setMenu(null);
    setSettingsOpen(false);
    clearAutoHideTimer();
    const startX = e.clientX;
    const startY = e.clientY;
    const keys = resolved.map((r) => r.key);
    let active = false;
    let lastOrder: string[] | null = null;
    const onMove = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 8) return;
      active = true;
      dragActiveRef.current = true;
      const rest = keys.filter((k) => k !== item.key);
      let insertAt = 0;
      for (const k of rest) {
        const rect = itemEls.current.get(k)?.getBoundingClientRect();
        if (rect && ev.clientX > rect.left + rect.width / 2) insertAt++;
      }
      lastOrder = [...rest.slice(0, insertAt), item.key, ...rest.slice(insertAt)];
      setDrag({ key: item.key, x: ev.clientX, y: ev.clientY, outside: isOutsideBar(ev.clientX, ev.clientY), order: lastOrder });
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!active) return;
      dragActiveRef.current = false;
      // 只抑制本次被拖 item 紧随其后的那次 click（拖出删除后点别的图标不受影响）
      suppressClickRef.current = item.key;
      setDrag(null);
      if (isOutsideBar(ev.clientX, ev.clientY)) {
        store.removeDockSite(item.entryGroupId, item.entrySiteId, item.entryUrl);
        return;
      }
      if (lastOrder) {
        const entries: DockEntry[] = lastOrder
          .map((k) => byKey.get(k))
          .filter((r): r is ResolvedDockItem => !!r)
          .map((r) => ({ groupId: r.entryGroupId, siteId: r.entrySiteId, url: r.entryUrl }));
        store.setDockOrder(entries);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const openMenu = (e: React.MouseEvent, item: ResolvedDockItem) => {
    // preventDefault 拦住主页的全局右键路由（它只看 defaultPrevented），
    // stopPropagation 拦住根 div 的空白右键菜单
    e.preventDefault();
    e.stopPropagation();
    setDrag(null);
    setSettingsOpen(false);
    setMenu({ x: e.clientX, y: e.clientY, key: item.key });
  };

  const removeItem = (item: ResolvedDockItem) => {
    setMenu(null);
    store.removeDockSite(item.entryGroupId, item.entrySiteId, item.entryUrl);
  };

  return (
    <>
      <div
        ref={barRef}
        data-dock-bar
        onMouseEnter={clearAutoHideTimer}
        onMouseLeave={scheduleAutoHide}
        className={`fixed bottom-3 sm:bottom-5 left-1/2 z-50 -translate-x-1/2 flex items-center gap-1 sm:gap-1.5 rounded-[28px] border border-white/10 bg-[#14141a]/70 ${size.padClass} shadow-2xl shadow-black/60 backdrop-blur-md max-w-[calc(100vw-20px)] overflow-x-auto select-none transition-all duration-300 ${
          dockHide === 'auto' && !barShown ? 'translate-y-[140%] opacity-0 pointer-events-none' : ''
        }`}
      >
        {dockHide !== 'hide' && ordered.length === 0 && (
          <p data-dock-empty className="px-3 py-1.5 text-xs text-white/55 whitespace-nowrap">
            {t('dock.empty')}
          </p>
        )}
        {dockHide !== 'hide' &&
          ordered.map((item) => {
            const isDragged = drag?.key === item.key;
            return (
              <div
                key={item.key}
                // 跨组拖拽源标记：Dock 图标是按住拖拽源，长按菜单钩子不对它 500ms 冻结位移，
                // 否则按住稍久再拖时后续 pointermove 会被冻结、Dock 拖拽起不来
                data-cross-source
                ref={(el) => {
                  if (el) itemEls.current.set(item.key, el);
                  else itemEls.current.delete(item.key);
                }}
                className="shrink-0"
                style={isDragged ? { opacity: 0 } : undefined}
              >
                <button
                  type="button"
                  data-dock-item={item.site.id ?? item.entrySiteId}
                  data-site-drag-id={item.key}
                  title={item.site.name}
                  aria-label={item.site.name}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onPointerDown={(e) => startDrag(e, item)}
                  onContextMenu={(e) => openMenu(e, item)}
                  onClick={() => {
                    if (suppressClickRef.current === item.key) {
                      suppressClickRef.current = null;
                      return;
                    }
                    window.open(item.site.url, '_blank');
                  }}
                  className={`flex ${size.btnClass} items-center justify-center rounded-2xl p-1 transition-colors hover:bg-white/8 touch-none cursor-grab active:cursor-grabbing`}
                >
                  <SiteLogo
                    logo={siteIconSrc(item.site)}
                    name={item.site.name}
                    url={item.site.url}
                    size={size.icon}
                    grayscale={!!item.site.dead}
                  />
                </button>
              </div>
            );
          })}
        {dockHide !== 'hide' && ordered.length > 0 && (
          <div aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-white/15" />
        )}
        <button
          ref={settingsBtnRef}
          type="button"
          data-dock-settings
          title={t('dock.settings')}
          aria-label={t('dock.settings')}
          onClick={() => {
            setMenu(null);
            setSettingsOpen((v) => !v);
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/65 transition-colors hover:bg-white/10 hover:text-white"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {drag && draggedItem &&
        createPortal(
          <div
            aria-hidden
            className="fixed z-[80] pointer-events-none flex flex-col items-center gap-1"
            style={{ left: drag.x - size.btn / 2, top: drag.y - (size.icon + 8) / 2, width: size.btn }}
          >
            <div
              className={`flex ${size.btnClass} items-center justify-center rounded-2xl p-1 bg-[#14141a]/90 shadow-2xl shadow-black/60 scale-105 ${
                drag.outside ? 'ring-2 ring-red-400' : 'ring-1 ring-white/25'
              }`}
            >
              <SiteLogo
                logo={siteIconSrc(draggedItem.site)}
                name={draggedItem.site.name}
                url={draggedItem.site.url}
                size={size.icon}
                grayscale={!!draggedItem.site.dead}
              />
            </div>
            {drag.outside && (
              <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-lg whitespace-nowrap">
                {t('dock.dragRemove')}
              </span>
            )}
          </div>,
          document.body,
        )}

      {settingsOpen &&
        (() => {
          const anchor = settingsBtnRef.current?.getBoundingClientRect();
          const panelW = 208;
          const panelH = 268;
          const left = anchor
            ? Math.max(8, Math.min(anchor.right - panelW, window.innerWidth - panelW - 8))
            : 8;
          const top = anchor ? Math.max(8, anchor.top - panelH - 8) : 8;
          const hideOptions: { value: DockHide; label: string }[] = [
            { value: 'show', label: t('dock.hideShow') },
            { value: 'auto', label: t('dock.hideAuto') },
            { value: 'hide', label: t('dock.hideAlways') },
          ];
          const sizeOptions: { value: DockSize; label: string }[] = [
            { value: 's', label: t('dock.sizeSmall') },
            { value: 'm', label: t('dock.sizeMedium') },
            { value: 'l', label: t('dock.sizeLarge') },
          ];
          return createPortal(
            <div
              ref={settingsRef}
              data-dock-settings-panel
              className="fixed z-[90] w-[208px] rounded-2xl border border-white/12 bg-[#1c1c24] p-1.5 shadow-2xl shadow-black/60"
              style={{ left, top }}
            >
              <p className="px-2 pb-1 pt-1.5 text-[13px] font-medium text-white/90">{t('dock.settings')}</p>
              <p className="px-2 pb-1 pt-1 text-[11px] text-white/45">{t('dock.hideLabel')}</p>
              {hideOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-dock-hide={opt.value}
                  onClick={() => setDisplayPrefs({ dockHide: opt.value })}
                  className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-white/85 transition-colors hover:bg-white/8"
                >
                  {opt.label}
                  {dockHide === opt.value && <Check size={15} className="text-indigo-300" />}
                </button>
              ))}
              <p className="px-2 pb-1 pt-2 text-[11px] text-white/45">{t('dock.sizeLabel')}</p>
              {sizeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  data-dock-size={opt.value}
                  onClick={() => setDisplayPrefs({ dockSize: opt.value })}
                  className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm text-white/85 transition-colors hover:bg-white/8"
                >
                  {opt.label}
                  {dockSize === opt.value && <Check size={15} className="text-indigo-300" />}
                </button>
              ))}
            </div>,
            document.body,
          );
        })()}

      {menu &&
        (() => {
          const target = byKey.get(menu.key);
          if (!target) return null;
          const left = Math.max(8, Math.min(menu.x, window.innerWidth - 168));
          const top = Math.max(8, Math.min(menu.y, window.innerHeight - 60));
          return createPortal(
            <div
              ref={menuRef}
              data-dock-menu
              className="fixed z-[90] w-[160px] rounded-2xl border border-white/12 bg-[#1c1c24] p-1 shadow-2xl shadow-black/60"
              style={{ left, top }}
            >
              <button
                type="button"
                data-dock-menu-remove
                onClick={() => removeItem(target)}
                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-red-300 transition-colors hover:bg-white/8"
              >
                <Trash2 size={15} />
                {t('dock.remove')}
              </button>
            </div>,
            document.body,
          );
        })()}
    </>
  );
}
