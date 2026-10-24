import React from 'react';
import { safeClose, safeMinimize, safeToggleMaximize } from './planWindow';
import type { PlanTheme } from '../../plan-app';

/**
 * 桌面计划应用的内置标题栏（第 3 轮）：替代系统白色标题栏。
 * 左侧 logo +「杂盒计划」、右侧透明度滑杆 + 暗夜/白天切换 + 最小化 / 最大化 / 关闭。
 * 拖动区：只放在非交互区——logo + 标题、中间空白；滑杆与按钮不在拖动区内，
 * 避免拖动区吞掉点击（Tauri 官方口径只保证拖动区内的空白可拖，控件点击不可靠）。
 * 便签切换已删（用户定：不要便签模式了）。窗口仍出现在任务栏
 * （tauri.conf skipTaskbar=false），最小化进任务栏。
 */
export default function PlanTitleBar({
  opacity,
  onOpacityChange,
  theme,
  onThemeChange,
}: {
  opacity: number;
  onOpacityChange: (v: number) => void;
  theme: PlanTheme;
  onThemeChange: (t: PlanTheme) => void;
}) {
  const light = theme === 'light';
  const btnBase =
    'shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-sm transition-colors';
  const btnCls = light
    ? `${btnBase} text-zinc-600 hover:bg-black/10 hover:text-zinc-900`
    : `${btnBase} text-white/70 hover:bg-white/10 hover:text-white`;
  const closeCls = `${btnBase} text-zinc-600 hover:bg-red-500/80 hover:text-white`;
  return (
    <div
      className={`sticky top-0 z-50 h-10 flex items-center gap-2 pl-2.5 pr-1.5 select-none ${
        light ? 'bg-[#f2f2f5]' : 'bg-[#17171d]'
      }`}
    >
      {/* 拖动区：logo + 标题 */}
      <div data-tauri-drag-region className="flex items-center gap-2 shrink-0 min-w-0">
        <img
          src="logo.svg"
          alt=""
          className="w-5 h-5 shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <span
          data-tauri-drag-region
          className={`text-sm font-medium truncate ${light ? 'text-zinc-900' : 'text-white/90'}`}
        >
          杂盒计划
        </span>
      </div>
      {/* 拖动区：中间空白 */}
      <div data-tauri-drag-region className="flex-1 min-w-0 h-full" />
      {/* 透明度：滑杆 50%–100%，默认 100%，存 zabox-plan-opacity（由 plan-app 持有） */}
      <label
        className={`shrink-0 flex items-center gap-1.5 text-[11px] ${
          light ? 'text-zinc-500' : 'text-white/50'
        }`}
      >
        <span className="hidden sm:inline">透明度</span>
        <input
          type="range"
          min={50}
          max={100}
          value={opacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          className="w-16 sm:w-20 accent-indigo-400"
        />
        <span className="tabular-nums w-8">{opacity}%</span>
      </label>
      {/* 外观简约版：只留暗夜 / 白天切换（存 zabox-plan-theme），面板翻色走 index.css */}
      <button
        type="button"
        title={light ? '切换暗夜' : '切换白天'}
        onClick={() => onThemeChange(light ? 'dark' : 'light')}
        className={btnCls}
      >
        {light ? '☾' : '☀'}
      </button>
      <button type="button" title="最小化" onClick={() => void safeMinimize()} className={btnCls}>
        —
      </button>
      <button
        type="button"
        title="最大化 / 还原"
        onClick={() => void safeToggleMaximize()}
        className={btnCls}
      >
        ▢
      </button>
      <button
        type="button"
        title="关闭"
        onClick={() => void safeClose()}
        className={light ? closeCls : `${btnBase} text-white/70 hover:bg-red-500/80 hover:text-white`}
      >
        ✕
      </button>
    </div>
  );
}
