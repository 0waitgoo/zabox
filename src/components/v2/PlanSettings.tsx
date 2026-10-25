import React, { useState } from 'react';
import {
  AI_PROVIDER_DEFAULTS,
  loadAiConfig,
  saveAiConfig,
  type AiConfig,
  type AiProvider,
} from './planAiConfig';
import type { PlanTheme } from '../../plan-app';

/**
 * 桌面计划应用的设置页（第 4 轮）：外观与 AI 接口聚合在这里，标题栏只留一个设置按钮。
 * - 外观：暗夜 / 白天切换（存 zabox-plan-theme）+ 透明度滑杆（存 zabox-plan-opacity，
 *   只改窗口底色透明度，字体保持不透明——底色由 plan-app 的根背景层承载）。
 * - AI 接口：DeepSeek / OpenAI / 自定义三档（地址与模型可改、口令密码框）。
 *   口令只存本机 localStorage（zabox-plan-ai-config），绝不进 store、不参与 GitHub 同步。
 *   AI 整理直接调这里配的 chat completions 接口，不走网站 /api。
 */
export default function PlanSettings({
  theme,
  onThemeChange,
  customColor,
  onCustomColorChange,
  opacity,
  onOpacityChange,
  onBack,
}: {
  theme: PlanTheme;
  onThemeChange: (t: PlanTheme) => void;
  customColor: string | null;
  onCustomColorChange: (color: string) => void;
  opacity: number;
  onOpacityChange: (v: number) => void;
  onBack: () => void;
}) {
  const [cfg, setCfg] = useState<AiConfig>(loadAiConfig);
  const [saved, setSaved] = useState(false);
  const light = theme === 'light';

  const faint = light ? 'text-zinc-500' : 'text-white/45';
  const inactiveAppearanceButton = light
    ? 'bg-black/[0.06] hover:bg-black/10 text-zinc-800'
    : 'bg-white/10 hover:bg-white/[0.18] text-white';
  const inputCls = light
    ? 'w-full rounded-lg border border-black/10 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:border-indigo-400'
    : 'w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-indigo-400';
  const sectionTitle = `text-sm font-medium ${light ? 'text-zinc-900' : 'text-white/90'}`;

  const changeProvider = (p: AiProvider) => {
    if (p === 'custom') {
      setCfg((c) => ({ ...c, provider: p }));
    } else {
      setCfg((c) => ({
        ...c,
        provider: p,
        baseUrl: AI_PROVIDER_DEFAULTS[p].baseUrl,
        model: AI_PROVIDER_DEFAULTS[p].model,
      }));
    }
    setSaved(false);
  };

  const save = () => {
    saveAiConfig({ ...cfg, baseUrl: cfg.baseUrl.trim(), model: cfg.model.trim() });
    setSaved(true);
  };

  return (
    <div className="flex flex-col gap-6 px-1 py-1">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            light
              ? 'bg-black/[0.06] hover:bg-black/10 text-zinc-800'
              : 'bg-white/10 hover:bg-white/[0.18] text-white'
          }`}
        >
          ← 返回
        </button>
        <h2 className={`text-base font-medium ${light ? 'text-zinc-900' : 'text-white'}`}>设置</h2>
      </div>

      {/* 外观 */}
      <section className="flex flex-col gap-3">
        <h3 className={sectionTitle}>外观</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => onThemeChange('dark')}
            aria-pressed={!customColor && !light}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !customColor && !light
                ? 'bg-indigo-500 text-white'
                : inactiveAppearanceButton
            }`}
          >
            ☾ 暗夜
          </button>
          <button
            type="button"
            onClick={() => onThemeChange('light')}
            aria-pressed={!customColor && light}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !customColor && light
                ? 'bg-indigo-500 text-white'
                : inactiveAppearanceButton
            }`}
          >
            ☀ 白天
          </button>
          <label className={`relative flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer focus-within:ring-2 focus-within:ring-indigo-400 ${
            customColor ? 'bg-indigo-500 text-white'
              : light ? 'bg-black/[0.06] hover:bg-black/10 text-zinc-800'
                : 'bg-white/10 hover:bg-white/[0.18] text-white'
          }`}>
            <span className="w-3.5 h-3.5 rounded-sm border border-current/30"
              style={{ backgroundColor: customColor ?? (light ? '#f2f2f5' : '#17171d') }} />
            自定义底色
            <input type="color" aria-label="自定义窗口底色"
              value={customColor ?? (light ? '#f2f2f5' : '#17171d')}
              onChange={(event) => onCustomColorChange(event.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </label>
        </div>
        <label className={`flex items-center gap-3 text-xs ${faint}`}>
          <span className="shrink-0">底色透明度</span>
          <input
            type="range"
            min={50}
            max={100}
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            className="flex-1 accent-indigo-400"
          />
          <span className="tabular-nums w-8 shrink-0">{opacity}%</span>
        </label>
        <p className={`text-[11px] ${faint}`}>只改窗口底色透明度，字体保持不透明。</p>
      </section>

      {/* AI 接口 */}
      <section className="flex flex-col gap-3">
        <h3 className={sectionTitle}>AI 接口（用于 AI 整理）</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              ['deepseek', 'DeepSeek'],
              ['openai', 'OpenAI'],
              ['custom', '自定义'],
            ] as [AiProvider, string][]
          ).map(([p, label]) => (
            <button
              key={p}
              type="button"
              onClick={() => changeProvider(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                cfg.provider === p
                  ? 'bg-indigo-500 text-white'
                  : light
                    ? 'bg-black/[0.06] hover:bg-black/10 text-zinc-800'
                    : 'bg-white/10 hover:bg-white/[0.18] text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={`text-xs ${faint}`}>接口地址</span>
          <input
            type="text"
            value={cfg.baseUrl}
            onChange={(e) => {
              setCfg((c) => ({ ...c, baseUrl: e.target.value }));
              setSaved(false);
            }}
            placeholder="https://api.deepseek.com/v1"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={`text-xs ${faint}`}>模型</span>
          <input
            type="text"
            value={cfg.model}
            onChange={(e) => {
              setCfg((c) => ({ ...c, model: e.target.value }));
              setSaved(false);
            }}
            placeholder="deepseek-chat"
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={`text-xs ${faint}`}>口令（API Key）</span>
          <input
            type="password"
            value={cfg.key}
            autoComplete="off"
            onChange={(e) => {
              setCfg((c) => ({ ...c, key: e.target.value }));
              setSaved(false);
            }}
            placeholder="只存本机，不会同步到 GitHub"
            className={inputCls}
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            className="shrink-0 px-4 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-400 text-white transition-colors"
          >
            保存
          </button>
          {saved && <span className="text-xs text-emerald-500">已保存，只存本机</span>}
        </div>
      </section>
    </div>
  );
}
