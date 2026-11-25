import React, { useEffect, useRef, useState } from 'react';
import { Check, LayoutTemplate, Palette, User } from 'lucide-react';
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
 * 面板形态与原 BackgroundMenu 同款：无底色图标触发 + 实色浮层 + 点外关闭。
 */
export default function PresetMenu({ store }: { store: LocalStore }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
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
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
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

  const pickMy = () => {
    if (!hasMyArchive) return; // 暂无存档：无操作（按钮已呈禁用态）
    store.applyPreset('my');
    setOpen(false);
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
            animate={{ opacity: 0, y: 0 }}
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
    </div>
    </>
  );
}
