import React from 'react';
import { safeClose } from './planWindow';
import type { PlanTheme } from '../../plan-app';

/**
 * 桌面计划应用的内置标题栏（第 5 轮）：替代系统白色标题栏，直角窗口。
 * 左侧 logo +「杂盒计划」、右侧设置 + 收起 / 最大化 / 关闭。
 * - 设置：打开设置页（外观与 AI 接口都聚合在里面），标题栏不再放透明度滑杆与白天切换；
 * - 收起（V）：第 5 轮改——— 按钮不再是最小化变悬浮（该功能已删，之前一点就弹回
 *   完整版），而是把窗口收成只留顶栏的细条（登录按钮 + 收起/最大化/关闭），再点展开；
 * - 最大化（□）：程序化最大化，是否由系统贴靠触发由 plan-app 的 expect 标记区分；
 * - 底色：透明 + 磨砂（窗口底色由 plan-app 根背景层统一承载，透明度滑杆只改底色、字体不透明）。
 * 拖动区：只放在非交互区——logo + 标题、中间空白；按钮不在拖动区内，点按不受影响。
 * 窗口仍出现在任务栏（tauri.conf skipTaskbar=false）。
 * 图标尺寸（用户定，第 5 轮缩小）：按钮 24px、字号 xs。
 */
export default function PlanTitleBar({
  theme,
  settingsOpen,
  onSettingsToggle,
  onToggleHeaderOnly,
  onToggleMaximize,
}: {
  theme: PlanTheme;
  settingsOpen: boolean;
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
      <button
        type="button"
        title="设置"
        aria-pressed={settingsOpen}
        onClick={onSettingsToggle}
        className={settingsCls}
      >
        ⚙
      </button>
      <button
        type="button"
        title="收起，只留顶栏"
        onClick={onToggleHeaderOnly}
        className={btnCls}
      >
        ⌄
      </button>
      <button
        type="button"
        title="最大化 / 还原"
        onClick={onToggleMaximize}
        className={btnCls}
      >
        ▢
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
        ✕
      </button>
    </div>
  );
}
