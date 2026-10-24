import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2, Check, Moon, Sun, Pipette } from 'lucide-react';
import { BACKGROUND_PRESETS, type LocalStore } from '../../store/localStore';
import { deleteBgImage, saveBgImage } from '../../store/bgImageDb';
import { OCEAN_DEFAULT_COLOR, setDisplayPrefs, useDisplayPrefs } from '../../store/displayPrefs';

/** 「深海蓝」纯色版的快捷色板（第九十二轮）：首个即默认深海蓝原色，其余为同气质的深色 */
const OCEAN_SWATCHES = [OCEAN_DEFAULT_COLOR, '#13294b', '#0b2e2a', '#2a1030', '#30151a', '#1a1a20'];

/**
 * 「外观」节（第一百一十一轮）：原顶栏背景按钮的面板正文整体并入预设面板——
 * 背景三项、深海蓝选色、明暗两档、两根透明度滑杆、背景模糊、本地图片，一项不丢。
 * 本节只负责渲染，触发与点外关闭由外层预设面板自理；背景改动走 store.setBackground
 * （经 update()，触发自动保存），偏好改动走 setDisplayPrefs（经订阅桥接，同样触发）。
 * 本地图片本体只存本机 IndexedDB，绝不上传；本地图片背景本身不进预设快照。
 */
export default function AppearanceSection({ store }: { store: LocalStore }) {
  // 「深海蓝」选色器展开态（第九十二轮）：点深海蓝条目时展开，选其他预设收起
  const [oceanPickerOpen, setOceanPickerOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const background = store.data.background;
  const usingLocal = background.kind === 'local';
  // 本机显示偏好（第四十二轮）：外观模式 + 透明度滑杆，只存本机、不随数据同步
  // 第六十轮：滑杆拆成两根——编组卡底框透明度（groupCardAlpha）与小组件底色不透明度（widgetAlpha）
  const displayPrefs = useDisplayPrefs();
  const alphaPct = Math.round(displayPrefs.groupCardAlpha * 100);
  const widgetAlphaPct = Math.round(displayPrefs.widgetAlpha * 100);
  // 背景模糊（第六十二轮）：本地图片背景的模糊强度，同样只存本机
  const bgBlurPct = Math.round(displayPrefs.bgBlur * 100);

  const pickLocalImage = async (file: File) => {
    const saved = await saveBgImage(file);
    if (saved) {
      store.setBackground({ kind: 'local', presetId: background.presetId, localStamp: Date.now() });
      setMessage({ ok: true, text: '已设为背景，图片只保存在这台设备上' });
    } else {
      setMessage({ ok: false, text: '保存失败：浏览器本地存储不可用' });
    }
  };

  const removeLocalImage = async () => {
    await deleteBgImage();
    store.setBackground({ kind: 'preset', presetId: background.presetId });
    setMessage({ ok: true, text: '已移除本地图片，回到预设背景' });
  };

  return (
    <div>
      {/* 第一百一十四轮：面板压缩——背景瓷砖由两列大块改三列小块（与预设单行同理），
          「默认背景」小标题省掉（瓷砖直接跟在「外观」节下），一项功能不砍 */}
      <div className="grid grid-cols-3 gap-1.5">
        {BACKGROUND_PRESETS.map((preset) => {
          const active = !usingLocal && background.presetId === preset.id;
          const isOcean = preset.id === 'ocean';
          return (
            <button
              key={preset.id}
              data-bg-preset={preset.id}
              onClick={() => {
                store.setBackground({ kind: 'preset', presetId: preset.id });
                setOceanPickerOpen(isOcean);
                setMessage(null);
              }}
              className={`group relative h-12 rounded-2xl overflow-hidden border text-left transition-all ${
                active ? 'border-indigo-400/80 ring-1 ring-indigo-400/50' : 'border-white/10 hover:border-white/30'
              }`}
              style={{ background: isOcean ? displayPrefs.oceanColor : preset.css }}
            >
              <span className="absolute left-2 bottom-1.5 text-[11px] font-medium text-white/90 drop-shadow">
                {preset.name}
              </span>
              {isOcean && (
                <span className="absolute right-1.5 bottom-1.5 text-white/60">
                  <Pipette size={11} />
                </span>
              )}
              {active && (
                <span className="absolute right-1.5 top-1.5 w-[18px] h-[18px] rounded-full bg-indigo-500 flex items-center justify-center">
                  <Check size={11} className="text-white" />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* 「深海蓝」选色（第九十二轮）：纯色版点开即选——色板快捷色 + 系统取色器自定义，
          选完即时生效并存本机显示偏好（ainav-display-prefs-v1），下次打开保持 */}
      {oceanPickerOpen && !usingLocal && background.presetId === 'ocean' && (
        <div data-ocean-picker className="mt-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2">
          <div className="flex items-center justify-between px-0.5 pb-2">
            <p className="text-[11px] text-white/60">深海蓝颜色</p>
            <span className="text-[11px] text-white/40 uppercase">{displayPrefs.oceanColor}</span>
          </div>
          <div className="flex items-center gap-2 px-0.5">
            {OCEAN_SWATCHES.map((c) => (
              <button
                key={c}
                data-ocean-swatch={c}
                title={c === OCEAN_DEFAULT_COLOR ? '深海蓝（默认）' : c}
                onClick={() => setDisplayPrefs({ oceanColor: c })}
                className={`w-7 h-7 rounded-full border transition-transform hover:scale-110 ${
                  displayPrefs.oceanColor === c ? 'border-indigo-400 ring-2 ring-indigo-400/50' : 'border-white/20'
                }`}
                style={{ background: c }}
              />
            ))}
            <label
              title="自定义取色"
              className="relative w-7 h-7 rounded-full border border-white/20 overflow-hidden cursor-pointer transition-transform hover:scale-110"
              style={{
                background: 'conic-gradient(#f87171, #facc15, #4ade80, #38bdf8, #a78bfa, #f87171)',
              }}
            >
              <input
                type="color"
                data-ocean-color-input
                value={displayPrefs.oceanColor}
                onChange={(e) => setDisplayPrefs({ oceanColor: e.target.value })}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="自定义深海蓝颜色"
              />
            </label>
          </div>
          {displayPrefs.oceanColor !== OCEAN_DEFAULT_COLOR && (
            <button
              data-ocean-reset
              onClick={() => setDisplayPrefs({ oceanColor: OCEAN_DEFAULT_COLOR })}
              className="mt-2 px-0.5 text-[11px] text-white/45 hover:text-white/80 transition-colors"
            >
              恢复深海蓝原色
            </button>
          )}
        </div>
      )}
      <div className="my-2 border-t border-white/[0.07]" />

      <p className="px-1 pb-1 text-[10px] tracking-wider text-white/40 uppercase">外观模式</p>
      <div className="grid grid-cols-2 gap-1.5">
        {(
          [
            { id: 'dark', label: '暗夜', Icon: Moon },
            { id: 'light', label: '白天', Icon: Sun },
          ] as const
        ).map(({ id, label, Icon }) => {
          const active = displayPrefs.theme === id;
          return (
            <button
              key={id}
              data-theme-option={id}
              onClick={() => setDisplayPrefs({ theme: id })}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-xl border text-xs whitespace-nowrap transition-all ${
                active
                  ? 'border-indigo-400/80 bg-white/8 text-white'
                  : 'border-white/10 text-white/55 hover:border-white/30 hover:text-white/85'
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      <p className="px-1 pt-2 pb-1 text-[10px] tracking-wider text-white/40 uppercase">透明度</p>
      <p className="px-1 pb-1 text-[11px] text-white/60">编组卡底框透明度</p>
      <div className="px-1 flex items-center gap-2.5">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={alphaPct}
          data-group-alpha-slider
          onChange={(e) => setDisplayPrefs({ groupCardAlpha: Number(e.target.value) / 100 })}
          className="flex-1 accent-indigo-500 cursor-pointer"
          aria-label="编组卡底框透明度"
        />
        <span className="text-[11px] text-white/60 w-9 text-right shrink-0">{alphaPct}%</span>
      </div>
      <p className="px-1 pt-1.5 pb-1 text-[11px] text-white/60">小组件底色不透明度</p>
      <div className="px-1 flex items-center gap-2.5">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={widgetAlphaPct}
          data-widget-alpha-slider
          onChange={(e) => setDisplayPrefs({ widgetAlpha: Number(e.target.value) / 100 })}
          className="flex-1 accent-indigo-500 cursor-pointer"
          aria-label="小组件底色不透明度"
        />
        <span className="text-[11px] text-white/60 w-9 text-right shrink-0">{widgetAlphaPct}%</span>
      </div>
      <div className="my-2 border-t border-white/[0.07]" />

      {/* 第一百一十四轮：「仅存本机，不上传」由两行说明并进标题行右侧，省一段 */}
      <p className="px-1 pb-1 text-[10px] tracking-wider text-white/40 uppercase flex items-center justify-between">
        <span>本地图片</span>
        <span className="normal-case tracking-normal text-white/35">仅存本机，不上传</span>
      </p>
      {/* 背景模糊滑杆（第六十二轮）：只作用于本地图片背景之上的 backdrop 模糊，预设背景不受影响 */}
      <p className="px-1 pb-1 text-[11px] text-white/60">背景模糊</p>
      <div className="px-1 pb-2 flex items-center gap-2.5">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={bgBlurPct}
          data-bg-blur-slider
          onChange={(e) => setDisplayPrefs({ bgBlur: Number(e.target.value) / 100 })}
          className="flex-1 accent-indigo-500 cursor-pointer"
          aria-label="背景模糊"
        />
        <span className="text-[11px] text-white/60 w-9 text-right shrink-0">{bgBlurPct}%</span>
      </div>
      <button
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-white/75 hover:bg-white/8 hover:text-white transition-colors"
      >
        <ImagePlus size={14} className="text-white/45" /> {usingLocal ? '更换本地图片' : '选择本地图片'}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pickLocalImage(file);
          e.target.value = '';
        }}
      />
      {usingLocal && (
        <button
          onClick={() => void removeLocalImage()}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-red-300/85 hover:bg-red-500/10 hover:text-red-200 transition-colors"
        >
          <Trash2 size={14} /> 移除本地图片
        </button>
      )}
      {message && (
        <p className={`px-1 pt-2 text-[11px] ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>{message.text}</p>
      )}
    </div>
  );
}
