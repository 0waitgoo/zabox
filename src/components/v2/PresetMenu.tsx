import React, { useEffect, useRef, useState } from 'react';
import { Check, LayoutTemplate } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { LocalStore, PresetId } from '../../store/localStore';
import { BUILTIN_PRESET_META, buildBuiltinPreset } from '../../data/presets';
import AppearanceSection from './AppearanceSection';

/**
 * 「预设」入口（第一百零六轮建、第一百零九轮改语义，接替原顶栏扳手；
 * 第一百一十一轮起顶栏背景按钮并入本面板）：布局/模板图标点开浮层，
 * 六套主页构成一键切换——一排两个，顺序 默认 / 我的 / 设计师 / 程序员 / 工具 / 娱乐导航
 * （娱乐导航最后一个），下方是「外观」节。
 * 切换换主页构成（编组、组件、布局）与外观（背景、明暗、透明度、模糊），计划数据不动，
 * 无二次确认：排版或外观一改动就自动存进「我的」（状态机见 store.update 与偏好订阅桥接），
 * 内置预设之间互切不覆盖存档。
 * 面板形态与原 BackgroundMenu 同款：无底色图标触发 + 实色浮层 + 点外关闭。
 */
export default function PresetMenu({ store }: { store: LocalStore }) {
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

  const pick = (id: PresetId) => {
    if (id === 'my') {
      if (!hasMyArchive) return; // 暂无存档：无操作（按钮已呈禁用态）
      store.applyPreset('my');
    } else {
      store.applyPreset(id, buildBuiltinPreset(id));
    }
    setOpen(false);
  };

  // 预设卡（2026-10-27 用户定）：一排两个，顺序 默认 / 我的 / 设计师 / 程序员 / 工具 / 娱乐导航
  // （娱乐导航最后一个）；卡片窄，名在上、短述在下单行截断，勾放名右
  const cardClass = (current: boolean, disabled = false) =>
    `w-full flex flex-col gap-0.5 px-3 py-2 rounded-2xl border text-left transition-all ${
      current
        ? 'border-indigo-400/80 bg-white/8'
        : disabled
          ? 'border-white/5 opacity-45 cursor-default'
          : 'border-white/10 hover:border-white/30 hover:bg-white/[0.04]'
    }`;
  const checkmark = (
    <span className="ml-auto shrink-0 w-[18px] h-[18px] rounded-full bg-indigo-500 flex items-center justify-center">
      <Check size={11} className="text-white" />
    </span>
  );
  const builtinCard = (meta: (typeof BUILTIN_PRESET_META)[number]) => {
    const current = activePreset === meta.id;
    return (
      <button
        key={meta.id}
        data-preset-option={meta.id}
        data-preset-current={current || undefined}
        title={meta.desc}
        onClick={() => pick(meta.id)}
        className={cardClass(current)}
      >
        <span className="flex items-center gap-1 w-full">
          <span className="text-[13px] font-medium text-white/90">{meta.name}</span>
          {current && checkmark}
        </span>
        <span className="text-[11px] text-white/45 truncate">
          {SHORT_DESC[meta.id] ?? meta.desc}
        </span>
      </button>
    );
  };

  // 第一百一十四轮：面板压缩——预设行由两行卡片改单行（名 + 短述 + 勾），
  // 全述只放 title 悬停；短述为原述的忠实缩写，语义不变
  const SHORT_DESC: Record<string, string> = {
    default: '均衡排版',
    designer: '设计资源优先',
    developer: '开发资源优先',
    tools: '整页小组件',
    entertainment: '影音娱乐站点',
  };

  return (
    <div ref={containerRef} className="relative shrink-0">
      {/* 触发按钮：与顶栏其他图标同款——无底色、白色图标，明暗随开合 */}
      <button
        onClick={() => setOpen((v) => !v)}
        title="预设：一键切换主页排版"
        aria-label="预设"
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
            className="absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-24px)] max-h-[85vh] overflow-y-auto rounded-3xl bg-[#17171d] border border-white/15 p-2.5 shadow-2xl shadow-black/70 z-50"
            style={{ marginLeft: panelShift }}
          >
            <p className="px-1 pb-1.5 text-[10px] tracking-wider text-white/40 uppercase">主页预设</p>
            <div className="grid grid-cols-2 gap-1">
              {builtinCard(BUILTIN_PRESET_META[0])}
              {/* 「我的」：恢复自己的存档（含外观）。无存档时呈禁用态注明「暂无存档」；
                  有存档或正在自定义态时说明：改动即自动保存 */}
              <button
                data-preset-option="my"
                data-preset-current={activePreset === 'my' || undefined}
                title="你现在的排版与外观，改动即自动保存"
                onClick={() => pick('my')}
                className={cardClass(activePreset === 'my', !hasMyArchive && activePreset !== 'my')}
              >
                <span className="flex items-center gap-1 w-full">
                  <span className="text-[13px] font-medium text-white/90">我的</span>
                  {activePreset === 'my' && checkmark}
                </span>
                <span className="text-[11px] text-white/45 truncate">
                  {hasMyArchive || activePreset === 'my' ? '改动即自动保存' : '暂无存档'}
                </span>
              </button>
              {BUILTIN_PRESET_META.slice(1).map((meta) => builtinCard(meta))}
            </div>
            <p className="px-1 pt-2 text-[11px] text-white/35 truncate">
              计划不受影响；改动自动存进「我的」。
            </p>
            {/* 外观节（第一百一十一轮）：原顶栏背景按钮的面板正文整体并入此处 */}
            <div className="my-2 border-t border-white/[0.07]" />
            <p className="px-1 pb-1.5 text-[10px] tracking-wider text-white/40 uppercase">外观</p>
            <AppearanceSection store={store} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
