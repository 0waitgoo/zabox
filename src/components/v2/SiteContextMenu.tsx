import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import type { SiteEntry } from '../../data/groups';
import { useLang } from '../../i18n/useLang';

/**
 * 站点右键菜单（第十六轮追加）：取代站点行/瓷砖上的悬停编辑/删除图标。
 * 实色小菜单，样式与卡片右键尺寸菜单一致；含「打开网站 / 编辑 / 删除」，
 * 删除在菜单内走两步确认（与删组的确认惯例一致：先变红字确认行，再点才真删）。
 * 在站点行上右键时由宿主 stopPropagation，不会同时弹出卡片的尺寸菜单。
 */
export interface SiteMenuState {
  x: number;
  y: number;
  site: SiteEntry;
}

/** 由右键事件算出菜单位置（与尺寸菜单同样的贴边收敛） */
export function siteMenuPosition(e: React.MouseEvent): { x: number; y: number } {
  const MENU_W = 188;
  const MENU_H = 176;
  return {
    x: Math.max(8, Math.min(e.clientX, window.innerWidth - MENU_W - 8)),
    y: Math.max(8, Math.min(e.clientY, window.innerHeight - MENU_H - 8)),
  };
}

export default function SiteContextMenu({
  state,
  onClose,
  onOpen,
  onEdit,
  onDelete,
}: {
  state: SiteMenuState;
  onClose: () => void;
  onOpen: (site: SiteEntry) => void;
  onEdit: (site: SiteEntry) => void;
  onDelete: (site: SiteEntry) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const { t } = useLang();

  // 换一个站点打开菜单时回到未确认态
  useEffect(() => {
    setConfirming(false);
  }, [state]);

  // 点菜单外 / Esc / 滚动 时关闭（与尺寸菜单同样的关闭口径）
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const itemCls =
    'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-white/75 hover:bg-white/8 hover:text-white transition-colors';

  return (
    <div
      ref={ref}
      data-site-menu
      className="fixed z-[90] w-[180px] rounded-2xl bg-[#1e1e26] border border-white/15 shadow-2xl shadow-black/70 p-1.5"
      style={{ left: state.x, top: state.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!confirming ? (
        <>
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-white/55 truncate">{state.site.name}</p>
          <button
            type="button"
            onClick={() => {
              onOpen(state.site);
              onClose();
            }}
            className={itemCls}
          >
            <ExternalLink size={13} className="text-white/45" /> {t('menu.openSite')}
          </button>
          <button
            type="button"
            onClick={() => {
              onEdit(state.site);
              onClose();
            }}
            className={itemCls}
          >
            <Pencil size={13} className="text-white/45" /> {t('menu.edit')}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} /> {t('menu.delete')}
          </button>
        </>
      ) : (
        <>
          <p className="px-2.5 pt-1.5 pb-1.5 text-[11px] text-red-300 truncate">{t('menu.deleteSiteConfirm', { name: state.site.name })}</p>
          <div className="flex gap-1.5 px-1 pb-1">
            <button
              type="button"
              onClick={() => {
                onDelete(state.site);
                onClose();
              }}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-red-500/80 text-white text-[11px] font-medium hover:bg-red-500 transition-colors"
            >
              {t('menu.confirmDelete')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/8 text-white/70 text-[11px] hover:bg-white/12 transition-colors"
            >
              {t('menu.cancelDelete')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
