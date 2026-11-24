import { useEffect, useRef, useState } from 'react';
import type { LocalStore } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import {
  DEFAULT_WIDGET_ACCENT,
  WIDGET_BASE_COLORS,
  accentHexFor,
  darkenHexToRgbTriplet,
  widgetColorVars,
} from './widgetColor';

/**
 * 小组件换底色面板（2026-11-24 实时化重做）：
 * - 本地 live 颜色状态：面板打开时用 store 值初始化；取色器拖动时立即更新本地值，
 *   不再把受控 input 的 value 绑在 store 上（旧做法：每次 input 事件都触发整仓
 *   structuredClone + 全树重渲染 + 写盘，拖动一秒几十次，主线程占满、原生取色弹窗
 *   跟着卡，视觉上就是「没更新」「卡住」）。
 * - 直写卡面变量：取色器 input 事件里同步按 data-card-key 找到卡根（.widget-panel，
 *   React 的 colorVars 就挂在它上面），setProperty 两个 CSS 变量，值用 widgetColorVars
 *   现成算法算，不等 React 重渲染就变色。
 * - 防抖落盘：取色器 input 事件只记待写值，最后一笔后 250ms 再调 store.setWidgetBaseColor；
 *   面板卸载（菜单关闭）或取色器失焦时立即刷掉待写值，不丢最后一笔。
 * - 色块点选与「恢复默认」是单次操作，仍立即写盘（不防抖），并清掉待写的防抖。
 * - 卸载时刷盘用 ref 存最新 flush，避免闭包拿到旧 store。
 */

/** 换底色落盘防抖时长（ms）：拖动时只记最后一笔，停手后此时间再写盘 */
const BASE_COLOR_FLUSH_DEBOUNCE_MS = 250;

/** 按 cardKey 找到卡根（.widget-panel，colorVars 挂在其 style 上）；找不到返回 null（摞内卡等边缘情形，走 store 写盘兜底） */
function findWidgetCardRoot(cardKey: string): HTMLElement | null {
  const wrapper = document.querySelector(`[data-card-key="${cardKey}"]`);
  if (!wrapper) return null;
  return wrapper.querySelector<HTMLElement>('.widget-panel');
}

/** 把颜色直写到卡根的两个 CSS 变量（不经过 React，拖动时立即跟手）；hex 为空表示恢复默认 */
function applyColorToCard(cardKey: string, hex: string | null): void {
  const el = findWidgetCardRoot(cardKey);
  if (!el) return;
  const vars = widgetColorVars(hex ?? undefined) as Record<string, string>;
  el.style.setProperty('--widget-base-rgb', vars['--widget-base-rgb']);
  el.style.setProperty('--widget-accent', vars['--widget-accent']);
}

export default function WidgetBaseColorPanel({ cardKey, store }: { cardKey: string; store: LocalStore }) {
  const { t } = useLang();
  const initial = (store.data.widgetBaseColors?.[cardKey] ?? DEFAULT_WIDGET_ACCENT).toLowerCase();
  const [live, setLive] = useState(initial);
  const pendingRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 立即把待写颜色刷进 store（防抖到期 / 面板关闭 / 失焦时调）；无待写值时不写盘 */
  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const hex = pendingRef.current;
    if (hex === null) return;
    pendingRef.current = null;
    store.setWidgetBaseColor(cardKey, hex);
  };
  // 卸载时刷掉最后一笔：用 ref 存最新 flush，避免闭包拿到旧 store
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  /** 取色器 input（拖动时连续触发）：本地立即更新 + 直写卡面 + 防抖落盘 */
  const onPickerInput = (hex: string) => {
    const lower = hex.toLowerCase();
    setLive(lower);
    applyColorToCard(cardKey, lower);
    pendingRef.current = lower;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), BASE_COLOR_FLUSH_DEBOUNCE_MS);
  };

  /** 色块点选（单次点击）：立即写盘，清掉待写的防抖 */
  const onSwatch = (hex: string) => {
    const lower = hex.toLowerCase();
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    setLive(lower);
    applyColorToCard(cardKey, lower);
    store.setWidgetBaseColor(cardKey, lower);
  };

  /** 恢复默认：立即删记录，本地回到标准蓝，卡面直写默认变量 */
  const onReset = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
    setLive(DEFAULT_WIDGET_ACCENT.toLowerCase());
    applyColorToCard(cardKey, null);
    store.setWidgetBaseColor(cardKey, null);
  };

  return (
    <div data-base-color-panel className="pt-2">
      {/* 预览条：底色（与卡面同款压暗算法）+ 强调色圆点，直观看到换色后的样子 */}
      <div
        data-base-color-preview
        className="mb-2.5 h-7 rounded-lg border border-white/10 flex items-center gap-2 px-2.5"
        style={{ background: `rgb(${darkenHexToRgbTriplet(live)})` }}
      >
        <span className="h-3.5 w-3.5 rounded-full shrink-0" style={{ backgroundColor: accentHexFor(live) }} />
        <span className="text-[11px] text-white/85">Aa</span>
        <span className="ml-auto text-[10px] uppercase tracking-wide text-white/40">{live}</span>
      </div>
      <div className="flex gap-1.5 pb-2">
        {WIDGET_BASE_COLORS.map(({ hex }) => (
          <button
            key={hex}
            data-base-color-swatch={hex.toLowerCase()}
            onClick={() => onSwatch(hex)}
            title={hex}
            className={`h-4 w-4 rounded-full border transition-transform hover:scale-110 ${
              live === hex.toLowerCase() ? 'border-white ring-1 ring-white/70' : 'border-white/25'
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 pb-1.5">
        <label
          className="relative h-6 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/25"
          style={{ backgroundColor: live }}
          title={t('home.pickColorTitle')}
        >
          <input
            type="color"
            data-base-color-input
            value={live}
            onChange={(e) => onPickerInput(e.target.value)}
            onBlur={() => flushRef.current()}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <span className="text-[10px] uppercase tracking-wide text-white/40">{live}</span>
        <button
          data-base-color-reset
          onClick={onReset}
          className="ml-auto px-2 py-1 rounded-lg text-[11px] bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          {t('home.tintReset')}
        </button>
      </div>
    </div>
  );
}
