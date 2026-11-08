import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clapperboard, Code, LayoutGrid, LayoutTemplate, Palette, User, Wrench, type LucideIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { LocalStore, PresetId } from '../../store/localStore';
import { BUILTIN_PRESET_META, buildBuiltinPreset } from '../../data/presets';
import { useLang } from '../../i18n/useLang';
import AppearanceSection from './AppearanceSection';

/**
 * 「预设」入口（第一百零六轮建、第一百零九轮改语义，接替原顶栏扳手；
 * 第一百一十一轮起顶栏背景按钮并入本面板）：布局/模板图标点开浮层，
 * 六套主页构成一键切换——一排三个（图标 + 小字标签），顺序 默认 / 我的 / 设计师 / 程序员 / 工具 / 娱乐导航
 * （娱乐导航最后一个），下方是「外观」节。娱乐导航卡单独高亮（2026-10-29 用户定）。
 * 切换换主页构成（编组、组件、布局）与外观（背景、明暗、透明度、模糊），计划数据不动。
 * 内置预设期改动先弹确认（2026-11-04 用户定）：提示「本次保存会覆盖掉“我的”预设」，
 * 点确认才把当前排版存进「我的」并翻为自定义，点取消则存档原样不动；
 * 内置预设之间互切不覆盖存档。
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

  // 覆盖确认提示打开时 Esc = 取消（不覆盖）；点遮罩同样取消
  const overwritePending = store.myPresetOverwritePending;
  useEffect(() => {
    if (!overwritePending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.cancelMyPresetOverwrite();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overwritePending, store]);

  const pick = (id: PresetId) => {
    if (id === 'my') {
      if (!hasMyArchive) return; // 暂无存档：无操作（按钮已呈禁用态）
      store.applyPreset('my');
    } else {
      store.applyPreset(id, buildBuiltinPreset(id));
    }
    setOpen(false);
  };

  // 预设瓷砖（2026-11-08 大改版，参考数据弹窗：图标 + 小字标签，一排三个）：
  // 顺序 默认 / 我的 / 设计师 / 程序员 / 工具 / 娱乐导航（娱乐导航最后一个）；
  // 短述只放 title 悬停；选中右上角小勾；娱乐导航卡单独高亮（2026-10-29 用户定）
  const sectionHeadCls = 'flex items-center gap-1.5 text-[10px] text-white/35';
  const PRESET_ICONS: Record<string, LucideIcon> = {
    default: LayoutGrid,
    my: User,
    designer: Palette,
    developer: Code,
    tools: Wrench,
    entertainment: Clapperboard,
  };
  const tileClass = (current: boolean, disabled = false, highlight = false) =>
    `relative flex flex-col items-center justify-center gap-0.5 h-12 rounded-xl border transition-all ${
      highlight
        ? 'border-violet-400/70 bg-violet-500/15 hover:border-violet-300/90'
        : current
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
  const builtinCard = (meta: (typeof BUILTIN_PRESET_META)[number]) => {
    const current = activePreset === meta.id;
    const highlight = meta.id === 'entertainment';
    const Icon = PRESET_ICONS[meta.id] ?? LayoutGrid;
    return (
      <button
        key={meta.id}
        data-preset-option={meta.id}
        data-preset-current={current || undefined}
        data-preset-highlight={highlight || undefined}
        title={t(`preset.desc.${meta.id}`)}
        onClick={() => pick(meta.id)}
        className={tileClass(current, false, highlight)}
      >
        <Icon size={18} className="text-white/70" />
        <span className="text-[10px] leading-none text-white/45">{t(`preset.name.${meta.id}`)}</span>
        {current && tileCheck}
      </button>
    );
  };

  // 第一百一十四轮：面板压缩——预设行由两行卡片改单行（名 + 短述 + 勾），
  // 全述只放 title 悬停；短述为原述的忠实缩写，语义不变

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
              {builtinCard(BUILTIN_PRESET_META[0])}
              {/* 「我的」：恢复自己的存档（含外观）。无存档时呈禁用态注明「暂无存档」；
                  有存档或正在自定义态时说明：改动即自动保存 */}
              <button
                data-preset-option="my"
                data-preset-current={activePreset === 'my' || undefined}
                title={t('preset.myTitle')}
                onClick={() => pick('my')}
                className={tileClass(activePreset === 'my', !hasMyArchive && activePreset !== 'my')}
              >
                <User size={18} className="text-white/70" />
                <span className="text-[10px] leading-none text-white/45">{t('preset.my')}</span>
                {activePreset === 'my' && tileCheck}
              </button>
              {BUILTIN_PRESET_META.slice(1).map((meta) => builtinCard(meta))}
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
    {overwritePending &&
      createPortal(
        <div
          data-my-preset-overwrite-prompt
          className="fixed inset-0 z-[70] bg-black/60 flex items-center justify-center p-4"
          onClick={() => store.cancelMyPresetOverwrite()}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('preset.overwriteTitle')}
 className="w-full max-w-[340px] rounded-2xl bg-[#23232b] border border-white/10 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[15px] font-semibold text-white mb-2">{t('preset.overwriteTitle')}</h3>
            <p className="text-[13px] leading-relaxed text-white/70">{t('preset.overwriteBody')}</p>
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                data-my-preset-overwrite-confirm
                onClick={() => store.confirmMyPresetOverwrite()}
                className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white hover:bg-indigo-400"
              >
                {t('preset.overwriteConfirm')}
              </button>
              <button
                type="button"
                data-my-preset-overwrite-cancel
                onClick={() => store.cancelMyPresetOverwrite()}
                className="flex-1 rounded-xl bg-white/[0.07] border border-white/10 py-2.5 text-sm text-white/85 hover:bg-white/10"
              >
                {t('menu.cancel')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
