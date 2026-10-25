import React from 'react';
import { ChevronDown, Settings, Square, X } from 'lucide-react';
import { safeClose } from './planWindow';
import PinButton from './PinButton';
import type { PlanTheme } from '../../plan-app';

/**
 * 桌面计划应用的内置标题栏（第 5 轮）：替代系统白色标题栏，直角窗口。
 * 左侧 logo +「杂盒计划」、右侧设置 + 收起 / 最大化 / 关闭。
 * - 设置：打开设置页（外观与 AI 接口都聚合在里面），标题栏不再放透明度滑杆与白天切换；
 * - 收起（V）：第 5 轮改——— 按钮不再是最小化变悬浮（该功能已删，之前一点就弹回
 *   完整版），而是把窗口收成只留顶栏的细条（登录按钮 + 收起/最大化/关闭），再点展开；
 * - 最大化（□）：程序化最大化，不再通过后台轮询撤销最大化；
 * - 底色：透明 + 磨砂（窗口底色由 plan-app 根背景层统一承载，透明度滑杆只改底色、字体不透明）。
 * 拖动区：只放在非交互区——logo + 标题、中间空白；按钮不在拖动区内，点按不受影响。
 * 窗口仍出现在任务栏（tauri.conf skipTaskbar=false）。
 * 图标尺寸（用户定，第 5 轮缩小）：按钮 24px、字号 xs；图标统一用 lucide
 * （第 6 轮：之前 ⚙⌄▢✕ 是混排的文字符号，看着不统一）。
 */
export default function PlanTitleBar({
  theme,
  settingsOpen,
  pinned,
  pinBusy,
  onTogglePin,
  onSettingsToggle,
  onToggleHeaderOnly,
  onToggleMaximize,
}: {
  theme: PlanTheme;
  settingsOpen: boolean;
  pinned: boolean;
  pinBusy: boolean;
  onTogglePin: () => void;
  onSettingsToggle: () => void;
  onToggleHeaderOnly: () => void;
  onToggleMaximize: () => void;
}) {
  const light = theme === 'light';
  const btnBase =
    'shrink-0 w-6 h-6 flex items-center justify-center rounded-md text-xs transition-colors';
  const btnCls = light
    ? `${btnBase} text-zinc-600 hover:bg-black/10 hover:text-zinc-900`
    : `${btnBase} text-white/70 hover:bg-white/10 hover:text-white`;
  const settingsCls = settingsOpen
    ? `${btnBase} bg-indigo-500 text-white`
    : btnCls;
  return (
    <div className="sticky top-0 z-50 h-10 flex items-center gap-2 pl-2.5 pr-1.5 select-none backdrop-blur">
      {/* 拖动区：logo + 标题 */}
      <div data-plan-drag-region className="flex items-center gap-2 shrink-0 min-w-0">
        <img
          data-plan-logo
          src="logo.svg"
          alt=""
          className="w-5 h-5 shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <span
          data-plan-drag-region
          className={`text-sm font-medium truncate ${light ? 'text-zinc-900' : 'text-white/90'}`}
        >
          杂盒计划
        </span>
      </div>
      {/* 拖动区：中间空白 */}
      <div data-plan-drag-region className="flex-1 min-w-0 h-full" />
      <PinButton pinned={pinned} busy={pinBusy} light={light} onToggle={onTogglePin} />
      <button
        type="button"
        title="设置"
        aria-pressed={settingsOpen}
        onClick={onSettingsToggle}
        className={settingsCls}
      >
        <Settings size={14} />
      </button>
      <button
        type="button"
        title="收起，只留顶栏"
        onClick={onToggleHeaderOnly}
        className={btnCls}
      >
        <ChevronDown size={14} />
      </button>
      <button
        type="button"
        title="最大化 / 还原"
        onClick={onToggleMaximize}
        className={btnCls}
      >
        <Square size={14} />
      </button>
      <button
        type="button"
        title="关闭"
        onClick={() => void safeClose()}
        className={
          light
            ? `${btnBase} text-zinc-600 hover:bg-red-500/80 hover:text-white`
            : `${btnBase} text-white/70 hover:bg-red-500/80 hover:text-white`
        }
      >
        <X size={14} />
      </button>
    </div>
  );
}
