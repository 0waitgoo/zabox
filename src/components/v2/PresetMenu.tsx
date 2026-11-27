import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Compass, LayoutTemplate, Palette, Plus, User } from 'lucide-react';
import { MAX_CUSTOM_PRESETS } from '../../store/localStore';
import { AnimatePresence, motion } from 'motion/react';
import type { LocalStore } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import AppearanceSection from './AppearanceSection';

/**
 * 「预设」入口（第一百零六轮建、第一百零九轮改语义，接替原顶栏扳手；
 * 第一百一十一轮起顶栏背景按钮并入本面板）：布局/模板图标点开浮层。
 * 2026-11-26 预设大清理（用户令）：内置预设（默认/设计师/程序员/工具/
 * 娱乐导航）全部删除，只剩「我的」——面板只剩一张「我的」瓷砖（恢复自己的
 * 存档，含外观；改动即自动保存），下方是「外观」节。被删预设的站已按主题
 * 收进主页顶部的快速组（见 data/quickGroups.ts）。内置预设期改动弹确认的
 * 覆盖流程随之退役（只有「我的」，改动直接自动保存，不再提示）。
 * 2026-11-26 用户令：顶栏罗盘（AI 导航）图标收进本弹窗（顶部 AI 导航入口，
 * 点后跳 nav 页）；顶栏只剩本图标。另修：动画 animate 透明度曾被大清理误写
 * 为 0 致面板全程不可见（2026-11-26 晚实测确认），已改回 1。
 * 2026-11-26 自定义预设（用户令）：网格加虚线框 + 号瓷砖新建预设，每人最多 4 个
 * （满 4 个时 + 号隐藏，网格正好 6 格＝2 行）；自定义预设是新建时拍下的固定快照，
 * 点按应用并回主页、右键弹出小菜单（改名/删除）；建/删/改名不走 update，不翻「我的」存档。
 * 2026-11-27 用户令：点「我的」或自定义预设都回到主页（从导航页点过来也不留在导航页）。
 * 面板形态与原 BackgroundMenu 同款：无底色图标触发 + 实色浮层 + 点外关闭。
 */
export default function PresetMenu({ store, onNavigate }: { store: LocalStore; onNavigate: (page: string) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  // 自定义预设右键菜单（2026-11-27 用户令）：改名 / 删除。定位在光标处（fixed，不被面板裁掉）
  const [ctxMenu, setCtxMenu] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  // 面板横向平移（打开时按按钮位置算）：按钮在顶栏左组第三位，手机上从按钮左缘
  // 展开 288px 面板会溢出右缘——把面板往左平移进视口（两侧各留 12px），桌面不动
  const [panelShift, setPanelShift] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const activePreset = store.data.activePreset;
  const hasMyArchive = !!store.data.myPreset;

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const panelW = Math.min(288, window.innerWidth - 24);
    let shift = 0;
    if (rect.left + panelW > window.innerWidth - 12) shift = window.innerWidth - 12 - rect.left - panelW;
    if (rect.left + shift < 12) shift = 12 - rect.left;
    setPanelShift(shift);
  }, [open ]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current && containerRef.current.contains(target)) return;
      // 右键菜单用 portal 挂在 body 下（不在容器内）：点菜单不关面板
      if (ctxMenuRef.current && ctxMenuRef.current.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  // 右键菜单：点菜单外任意处 / 按 Esc 关闭；面板关了菜单也关
  useEffect(() => {
    if (!ctxMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) setCtxMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);
  useEffect(() => {
    if (!open) setCtxMenu(null);
  }, [open ]);

  const pickMy = () => {
    if (!hasMyArchive) return; // 暂无存档：无操作（按钮已呈禁用态）
    store.applyPreset('my');
    setOpen(false);
    onNavigate('home'); // 2026-11-27 用户令：点预设回到主页（从导航页点过来也不留在导航页）
  };

  const sectionHeadCls = 'flex items-center gap-1.5 text-[10px] text-white/35';
  const tileClass = (current: boolean, disabled = false) =>
    `relative flex flex-col items-center justify-center gap-0.5 h-12 rounded-xl border transition-all ${
      current
        ? 'border-indigo-400/80 bg-white/8'
        : disabled
          ? 'border-white/5 opacity-45 cursor-default'
          : 'border-white/10 hover:border-white/30 hover:bg-white/[0.04]'
    }`;
  const tileCheck = (
    <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-indigo-500 flex items-center justify-center">
      <Check size={9} className="text-white" />
    </span>
  );

  return (
    <>
    <div ref={containerRef} className="relative shrink-0">
      {/* 触发按钮：与顶栏其他图标同款——无底色、白色图标，明暗随开合 */}
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('preset.switchTitle')}
        aria-label={t('preset.aria')}
        data-testid="topnav-presets"
        className={`p-2 sm:p-2.5 rounded-xl flex items-center justify-center transition-colors duration-300 ${
          open ? 'text-white' : 'text-white/55 hover:text-white'
        }`}
      >
        <LayoutTemplate size={20} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.15 }}
            /* 面板实色不透明（同 BackgroundMenu 口径）：不用毛玻璃，避免透出后面卡片文字；
               marginLeft 为打开时算出的视口平移（手机防溢出，桌面恒 0），不与 motion 的 transform 冲突 */
 className="absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-24px)] max-h-[85vh] overflow-y-auto rounded-3xl bg-[#17171d] border border-white/15 p-2 z-50"
            style={{ marginLeft: panelShift }}
          >
            <p className={`px-3 pt-1.5 pb-0.5 ${sectionHeadCls}`}><LayoutTemplate size={11} className="text-white/40" /> {t('preset.heading')}</p>
            <div className="grid grid-cols-3 gap-1.5 px-3 py-1">
              {/* 「我的」：恢复自己的存档（含外观）。无存档时呈禁用态注明「暂无存档」；
                  有存档或正在自定义态时说明：改动即自动保存 */}
              <button
                data-preset-option="my"
                data-preset-current={activePreset === 'my' || undefined}
                title={t('preset.myTitle')}
                onClick={pickMy}
                className={tileClass(activePreset === 'my', !hasMyArchive && activePreset !== 'my')}
              >
                <User size={18} className="text-white/70" />
                <span className="text-[10px] leading-none text-white/45">{t('preset.my')}</span>
                {activePreset === 'my' && tileCheck}
              </button>
              {/* AI 导航（2026-11-26 用户令）：顶栏罗盘图标收进本弹窗，与「我的」并列一格，点后跳 AI 网站导航页 */}
              <button
                data-ai-nav-tile
                onClick={() => { setOpen(false); onNavigate('nav'); }}
                className={tileClass(false)}
              >
                <Compass size={18} className="text-white/70" />
                <span className="text-[10px] leading-none text-white/45">{t('topbar.navAi')}</span>
              </button>
              {/* 自定义预设（2026-11-26 用户令）：独立存档槽（2026-11-27 存档语义）——新建时拍下当前构成，
                  激活时改动自动写回自己的快照，不动「我的」；点按应用并关面板；
                  当前激活的显示蓝勾；2026-11-27 用户令：右键弹出小菜单（改名/删除），
                  点按应用后回到主页。顺序：我的、AI 导航、自定义（按创建时间）、+ 号 */}
              {store.data.customPresets.map((p) => (
                <button
                  key={p.id}
                  data-custom-preset={p.id}
                  title={p.name}
                  onClick={() => { store.applyCustomPreset(p.id); setOpen(false); onNavigate('home'); }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    // 菜单宽约 112px、高约 76px，贴着视口边收一下，不溢出
                    const x = Math.max(8, Math.min(e.clientX, window.innerWidth - 120));
                    const y = Math.max(8, Math.min(e.clientY, window.innerHeight - 84));
                    setCtxMenu({ id: p.id, name: p.name || t('preset.customDefault'), x, y });
                  }}
                  className={tileClass(activePreset === p.id)}
                >
                  <LayoutTemplate size={18} className="text-white/70" />
                  <span className="text-[10px] leading-none text-white/45">{p.name || t('preset.customDefault')}</span>
                  {activePreset === p.id && tileCheck}
                </button>
              ))}
              {/* + 号新建（2026-11-26 用户令）：虚线框，点按以当前排版新建一个预设快照；
                  满 4 个时不渲染（网格正好 6 格＝2 行） */}
              {store.data.customPresets.length < MAX_CUSTOM_PRESETS && (
                <button
                  data-add-preset
                  title={t('preset.createCustom')}
                  onClick={() => { store.createCustomPreset(); }}
                  className="relative flex flex-col items-center justify-center gap-0.5 h-12 rounded-xl border border-dashed border-white/25 text-white/55 hover:border-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-all"
                >
                  <Plus size={18} />
                  <span className="text-[10px] leading-none">{t('preset.createCustom')}</span>
                </button>
              )}
            </div>
            <p className="px-3 pt-1.5 text-[10px] text-white/35">
              {t('preset.planNote')}
            </p>
            {/* 外观节（第一百一十一轮）：原顶栏背景按钮的面板正文整体并入此处 */}
            <div className="my-2 border-t border-white/8" />
            <p className={`px-3 pt-1.5 pb-0.5 ${sectionHeadCls}`}><Palette size={11} className="text-white/40" /> {t('preset.appearance')}</p>
            <AppearanceSection store={store} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 自定义预设右键菜单（2026-11-27 用户令）：改名 / 复制到我的 / 删除。fixed 定位在光标处，
          用 portal 挂到 body——宽屏时面板在 LeftRail 里（-translate-x-1/2 是 transform，
          会让后代 fixed 改相对祖先定位、菜单往右偏到屏缘），portal 脱离 transform 祖先后
          fixed 重新相对视口，位置才对。面板的点外关闭已认 ctxMenuRef，点菜单不关面板 */}
      {open && ctxMenu && createPortal(
        <div
          ref={ctxMenuRef}
          data-preset-ctx-menu
          className="fixed z-[60] w-28 rounded-xl bg-[#232329] border border-white/15 py-1 shadow-xl"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            data-preset-menu-rename
            onClick={() => {
              const next = window.prompt(t('preset.rename'), ctxMenu.name);
              const id = ctxMenu.id;
              setCtxMenu(null);
              if (next === null) return;
              if (!next.trim()) return;
              store.renameCustomPreset(id, next);
            }}
            className="w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
          >
            {t('preset.rename')}
          </button>
          <button
            data-preset-menu-copy-to-my
            onClick={() => {
              const id = ctxMenu.id;
              const name = ctxMenu.name;
              setCtxMenu(null);
              if (window.confirm(t('preset.copyToMyConfirm', { name }))) store.copyCustomPresetToMy(id);
            }}
            className="w-full px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10"
          >
            {t('preset.copyToMy')}
          </button>
          <button
            data-preset-menu-delete
            onClick={() => {
              const id = ctxMenu.id;
              setCtxMenu(null);
              if (window.confirm(t('preset.deleteConfirm'))) store.deleteCustomPreset(id);
            }}
            className="w-full px-3 py-1.5 text-left text-xs text-red-300 hover:bg-white/10"
          >
            {t('menu.delete')}
          </button>
        </div>,
        document.body
      )}
    </div>
    </>
  );
}
