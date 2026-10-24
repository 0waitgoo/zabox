import React from 'react';
import { safeClose, safeMinimize, safeToggleMaximize } from './planWindow';

/**
 * 桌面计划应用的内置标题栏（v2，便签优化版）：替代系统白色标题栏。
 * 深色底（与应用 #17171d 一致，悬浮窗模式用浅一点的底），左侧 logo +「杂盒计划」、
 * 右侧透明度滑杆 + 悬浮窗切换 + 最小化 / 最大化 / 关闭。
 * 拖动区：整条标题栏都是拖动区（Tauri 官方口径：拖动区内的按钮、滑杆等可交互控件
 * 仍可正常点击），不再只有「杂盒计划」几个字能拖；悬浮窗模式下滑杆收窄，
 * 保证空白拖动带够宽。窗口仍出现在任务栏（tauri.conf skipTaskbar=false），
 * 最小化进任务栏。
 */
export default function PlanTitleBar({
  opacity,
  onOpacityChange,
  mini,
  onToggleMini,
}: {
  opacity: number;
  onOpacityChange: (v: number) => void;
  mini: boolean;
  onToggleMini: () => void;
}) {
  const btnCls =
    'shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors';
  return (
    <div
      data-tauri-drag-region
      className={`sticky top-0 z-50 h-10 flex items-center gap-2 pl-2.5 pr-1.5 select-none ${
        mini ? 'bg-[#23232c]' : 'bg-[#17171d]'
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
        <span data-tauri-drag-region className="text-sm font-medium text-white/90 truncate">
          杂盒计划
        </span>
      </div>
      {/* 拖动区：中间空白 */}
      <div data-tauri-drag-region className="flex-1 min-w-0 h-full" />
      {/* 透明度：滑杆 50%–100%，默认 100%，存 zabox-plan-opacity（由 plan-app 持有） */}
      <label className="shrink-0 flex items-center gap-1.5 text-[11px] text-white/50">
        <span className="hidden sm:inline">透明度</span>
        <input
          type="range"
          min={50}
          max={100}
          value={opacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          className={`${mini ? 'w-12' : 'w-16 sm:w-20'} accent-indigo-400`}
        />
        <span className="tabular-nums w-8">{opacity}%</span>
      </label>
      <button
        type="button"
        title={mini ? '回完整版' : '悬浮窗'}
        onClick={onToggleMini}
        className="shrink-0 h-7 px-2 flex items-center rounded-md text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors"
      >
        {mini ? '完整版' : '便签'}
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
        className={`${btnCls} hover:bg-red-500/80`}
      >
        ✕
      </button>
    </div>
  );
}
