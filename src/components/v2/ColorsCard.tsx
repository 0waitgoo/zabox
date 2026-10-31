import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Lock,
  LockOpen,
  Palette,
  RotateCcw,
  Search,
  Shuffle,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import {
  COLOR_FAMILIES,
  TRADITIONAL_COLORS,
  TRADITIONAL_PALETTES,
  colorByName,
  colorValueOf,
  dailyColor,
  dailyPalette,
  readableTextOn,
  stripTones,
  type ColorFormat,
  type TraditionalColor,
  type TraditionalPalette,
} from '../../data/traditionalColors';
import { closeColorsWorkspace, openColorsWorkspace, useColorsWorkspace } from '../../store/colorsWorkspace';
import { removeSavedPalette, savePalette, toggleFavorite, useColorsData } from '../../store/colorsData';
import { useLang } from '../../i18n/useLang';
import type { WidgetTint } from '../../store/localStore';
import { Card, CardIconBadge } from './Card';

/**
 * A 型 · 中式色卡（第一百零七轮，设计稿定版实现）：
 * 158 种中国传统色（数据随包、零联网）。双层形态与文件工具卡同制——
 * 卡面 = 当日配色（按日期取模轮换）色带，点色带直接复制 HEX；右上「换一组」
 * 随机抽内置配色、再点回当日组；「展开」就地撑开工作区（高度由 HomePage 抬到
 * 收起态 2 倍，与文件工具工作区同口径），工作区三页签：色墙（色系筛选 +
 * 色名/拼音/HEX 搜索、点格复制、悬停/长按详情）、配色（9 组内置传统配色整组
 * 复制 + 随机配色带锁定）、收藏（单色 + 自存配色，走独立 key 落盘）。
 * 格式三段切换（HEX/RGB/CMYK）是工作区全局态：三页签的显示与复制都跟它走；
 * 卡面复制恒为 HEX（设计稿 1.1）。收藏只存色名引用，色值以数据集为准。
 */

const FORMAT_OPTIONS: { id: ColorFormat; label: string }[] = [
  { id: 'hex', label: 'HEX' },
  { id: 'rgb', label: 'RGB' },
  { id: 'cmyk', label: 'CMYK' },
];

/** 剪贴板写入：优先 Clipboard API，非安全上下文回落 execCommand（与站内零依赖口径一致） */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** 随机配色：跨色系抽 4 色（同组不重复色系）；locked 里已锁定的位置保留原色 */
function drawRandomPalette(locked: (TraditionalColor | null)[]): TraditionalColor[] {
  const families = [...COLOR_FAMILIES];
  // 洗牌色系顺序，依次为未锁定的位置取一个没用过的色系
  for (let i = families.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [families[i], families[j]] = [families[j], families[i]];
  }
  const usedFamilies = new Set(locked.filter(Boolean).map((c) => c!.family));
  let fi = 0;
  return [0, 1, 2, 3].map((i) => {
    if (locked[i]) return locked[i]!;
    while (fi < families.length && usedFamilies.has(families[fi])) fi++;
    const fam = families[fi++] ?? COLOR_FAMILIES[Math.floor(Math.random() * COLOR_FAMILIES.length)];
    usedFamilies.add(fam);
    const pool = TRADITIONAL_COLORS.filter((c) => c.family === fam);
    return pool[Math.floor(Math.random() * pool.length)];
  });
}

export default function ColorsCard({
  delay = 0,
  colSpan = 2,
  heightUnits = 1,
  tint,
}: {
  delay?: number;
  colSpan?: 1 | 2;
  heightUnits?: 1 | 2;
  tint?: WidgetTint;
}) {
  const ws = useColorsWorkspace();
  const colorsData = useColorsData();
  const { t } = useLang();
  const [everOpened, setEverOpened] = useState(ws.open);
  useEffect(() => {
    if (ws.open) setEverOpened(true);
  }, [ws.open]);

  /* ---------- 复制 + toast（站内既有轻提示形态：对勾 + 一行字，数秒自收） ---------- */
  const [toast, setToast] = useState<{ id: number; text: string; hex?: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (text: string, hex?: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, hex });
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };
  const copyColor = (c: TraditionalColor, format: ColorFormat) => {
    const value = colorValueOf(c, format);
    void copyText(value).then((ok) => {
      if (ok) showToast(t('colors.copiedColor', { name: c.name, value }), c.hex);
    });
  };

  /* ---------- 卡面：当日配色 / 换一组 ---------- */
  const today = useMemo(() => dailyPalette(), []);
  const todayColor = useMemo(() => dailyColor(), []);
  const [swapped, setSwapped] = useState<TraditionalPalette | null>(null);
  const facePalette = swapped ?? today;
  const faceColors = facePalette.colors.map(colorByName).filter((c): c is TraditionalColor => !!c);
  const swapPalette = () => {
    if (swapped) {
      setSwapped(null);
      return;
    }
    const pool = TRADITIONAL_PALETTES.filter((p) => p.name !== today.name);
    setSwapped(pool[Math.floor(Math.random() * pool.length)]);
  };

  /* ---------- 工作区状态 ---------- */
  const [tab, setTab] = useState<'wall' | 'palettes' | 'favs'>('wall');
  const [format, setFormat] = useState<ColorFormat>('hex');
  const [family, setFamily] = useState<string>('全部');
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState<TraditionalColor | null>(null);
  const [randomSet, setRandomSet] = useState<TraditionalColor[]>(() => drawRandomPalette([null, null, null, null]));
  const [locks, setLocks] = useState<boolean[]>([false, false, false, false]);

  const wallColors = useMemo(() => {
    const q = query.trim().toLowerCase();
    const qPlain = stripTones(q);
    return TRADITIONAL_COLORS.filter((c) => {
      if (family !== '全部' && c.family !== family) return false;
      if (!q) return true;
      return (
        c.name.includes(q) ||
        stripTones(c.pinyin).includes(qPlain) ||
        c.hex.replace('#', '').startsWith(q.replace('#', ''))
      );
    });
  }, [family, query]);

  const favColors = colorsData.favorites.map(colorByName).filter((c): c is TraditionalColor => !!c);
  const recentFavs = favColors.slice(-6).reverse();

  const copyPalette = (name: string, colors: TraditionalColor[]) => {
    const text = colors.map((c) => colorValueOf(c, format)).join(', ');
    void copyText(text).then((ok) => {
      if (ok) showToast(t('colors.copiedGroup', { name }));
    });
  };

  const reroll = () => {
    setRandomSet((prev) => drawRandomPalette(prev.map((c, i) => (locks[i] ? c : null))));
  };

  const saveRandom = () => {
    const name = `我的配色${colorsData.savedPalettes.length + 1}`;
    savePalette(name, randomSet.map((c) => c.name));
    showToast(t('colors.savedAs', { name }));
  };

  /* ---------- 子渲染 ---------- */

  /** 色格（色墙/收藏共用）：色块 + 色名 + 当前格式色值，文字按亮度反转；点格复制 */
  const renderCell = (c: TraditionalColor) => {
    const fg = readableTextOn(c);
    const isFav = colorsData.favorites.includes(c.name);
    return (
      <div
        key={c.name}
        data-color-cell={c.name}
        className="group/cell relative min-w-0"
        onMouseEnter={() => setDetail(c)}
      >
        <button
          type="button"
          aria-label={t('colors.copyColor', { name: c.name })}
          onClick={() => copyColor(c, format)}
          onPointerDown={(e) => {
            if (e.pointerType === 'touch') {
              const t = setTimeout(() => setDetail(c), 450);
              const clear = () => clearTimeout(t);
              window.addEventListener('pointerup', clear, { once: true });
            }
          }}
          className="flex h-16 w-full flex-col justify-end rounded-xl p-1.5 text-left ring-1 ring-black/20 transition-transform hover:scale-[1.03]"
          style={{ backgroundColor: c.hex, color: fg }}
        >
          <span className="text-xs font-medium leading-tight truncate w-full">{c.name}</span>
          <span className="text-[10px] leading-tight opacity-80 truncate w-full">{colorValueOf(c, format)}</span>
        </button>
        <button
          type="button"
          data-color-fav={c.name}
          aria-label={isFav ? t('colors.unfavColor', { name: c.name }) : t('colors.favColor', { name: c.name })}
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(c.name);
          }}
          className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/35 text-white transition-opacity ${
            isFav ? 'opacity-100' : 'opacity-0 group-hover/cell:opacity-100'
          }`}
        >
          <Star size={11} fill={isFav ? 'currentColor' : 'none'} className={isFav ? 'text-amber-300' : ''} />
        </button>
      </div>
    );
  };

  /** 一组色带（卡面/配色/收藏共用）：点单条复制，hexOnly 时恒复制 HEX（卡面口径） */
  const renderBands = (colors: TraditionalColor[], opts?: { labels?: boolean; bandClass?: string; hexOnly?: boolean; rootClass?: string }) => (
    <div className={`flex min-h-0 gap-1 ${opts?.rootClass ?? ''}`}>
      {colors.map((c) => (
        <button
          key={c.name}
          type="button"
          data-color-band={c.name}
          aria-label={t('colors.copyColor', { name: c.name })}
          onClick={() => copyColor(c, opts?.hexOnly ? 'hex' : format)}
          className={`relative flex-1 min-w-0 rounded-lg ring-1 ring-black/20 transition-transform hover:scale-[1.02] ${opts?.bandClass ?? ''}`}
          style={{ backgroundColor: c.hex }}
        >
          {opts?.labels && (
            <span
              className="absolute inset-x-0 bottom-1 text-center text-[10px] leading-tight truncate px-0.5"
              style={{ color: readableTextOn(c) }}
            >
              {c.name}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  const formatSwitch = (
    <div className="flex rounded-lg border border-white/12 bg-white/[0.04] p-0.5 shrink-0" role="tablist" aria-label={t('colors.formatAria')}>
      {FORMAT_OPTIONS.map((f) => (
        <button
          key={f.id}
          type="button"
          role="tab"
          aria-selected={format === f.id}
          data-color-format={f.id}
          onClick={() => setFormat(f.id)}
          className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
            format === f.id ? 'bg-indigo-500/85 text-white font-medium' : 'text-white/55 hover:text-white'
          }`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <Card
      title={t('widget.nameColors')}
      icon={
        <CardIconBadge className="bg-[#9d2933] text-white">
          <Palette size={14} />
        </CardIconBadge>
      }
      right={
        ws.open ? (
          <button
            type="button"
            data-colors-close
            onClick={(e) => {
              e.stopPropagation();
              closeColorsWorkspace();
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white shrink-0"
          >
            <X size={12} />
            {t('task.collapse')}
          </button>
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              data-colors-swap
              onClick={(e) => {
                e.stopPropagation();
                swapPalette();
              }}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              {swapped ? <RotateCcw size={12} /> : <Shuffle size={12} />}
              {swapped ? t('colors.backToToday') : t('colors.swapGroup')}
            </button>
            <button
              type="button"
              data-colors-expand
              onClick={(e) => {
                e.stopPropagation();
                openColorsWorkspace();
              }}
              className="rounded-lg px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white"
            >
              {t('task.expand')}
            </button>
          </div>
        )
      }
      delay={delay}
      tint={tint}
      watermark="🎨"
    >
      <div data-colors-card className="relative flex flex-1 min-h-0 flex-col">
        {/* 卡面：工作区打开时隐藏（状态无损） */}
        <div className={`flex-1 min-h-0 flex-col ${ws.open ? 'hidden' : 'flex'}`}>
          <div className="mb-2 flex items-baseline gap-2 shrink-0">
            <span data-colors-palette-name className="text-sm font-medium text-white/90">
              {facePalette.name}
            </span>
            {colSpan === 2 && <span className="text-[11px] text-white/40 truncate">{facePalette.note}</span>}
            {!swapped && <span className="ml-auto text-[10px] text-white/35 shrink-0">{t('colors.todayPalette')}</span>}
          </div>
          {renderBands(faceColors, { labels: colSpan === 2, hexOnly: true, bandClass: 'min-h-[52px]', rootClass: 'flex-1' })}

          {/* 1 栏 × 2 高：当日一色详情 */}
          {colSpan === 1 && heightUnits === 2 && (
            <button
              type="button"
              data-color-band={todayColor.name}
              onClick={() => copyColor(todayColor, 'hex')}
              className="mt-2 flex items-center gap-3 rounded-2xl p-3 text-left ring-1 ring-black/20 shrink-0"
              style={{ backgroundColor: todayColor.hex, color: readableTextOn(todayColor) }}
            >
              <span className="min-w-0">
                <span className="block text-base font-semibold leading-tight">
                  {todayColor.name}
                  <span className="ml-2 text-xs font-normal opacity-75">{todayColor.pinyin}</span>
                </span>
                <span className="block text-xs opacity-80 mt-0.5">{colorValueOf(todayColor, 'hex')} · {t('colors.todayColor')}</span>
              </span>
            </button>
          )}

          {/* 2 栏 × 2 高：收藏速览 */}
          {colSpan === 2 && heightUnits === 2 && (
            <div className="mt-3 shrink-0">
              <p className="text-[11px] text-white/40 mb-1.5">{t('colors.favsGlance')}</p>
              {recentFavs.length > 0 ? (
                <div className="flex gap-1.5">
                  {recentFavs.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      data-color-band={c.name}
                      aria-label={t('colors.copyColor', { name: c.name })}
                      onClick={() => copyColor(c, 'hex')}
                      className="h-10 flex-1 min-w-0 rounded-lg ring-1 ring-black/20 flex items-end justify-center pb-1 transition-transform hover:scale-[1.03]"
                      style={{ backgroundColor: c.hex }}
                    >
                      <span className="text-[10px] truncate px-0.5" style={{ color: readableTextOn(c) }}>
                        {c.name}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-white/35">{t('colors.favsGlanceEmpty')}</p>
              )}
            </div>
          )}
        </div>

        {/* 工作区面：首次打开后常驻挂载（收起只隐藏） */}
        {everOpened && (
          <div data-colors-workspace className={`flex-1 min-h-0 flex-col ${ws.open ? 'flex' : 'hidden'}`}>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <div className="flex rounded-lg border border-white/12 bg-white/[0.04] p-0.5" role="tablist" aria-label={t('colors.tabsAria')}>
                {(
                  [
                    { id: 'wall', label: t('colors.tabWall') },
                    { id: 'palettes', label: t('colors.tabPalettes') },
                    { id: 'favs', label: t('colors.tabFavs') },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={tab === t.id}
                    data-colors-tab={t.id}
                    onClick={() => setTab(t.id)}
                    className={`rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                      tab === t.id ? 'bg-indigo-500/85 text-white font-medium' : 'text-white/55 hover:text-white'
                    }`}
                  >
                    {t.label}
                    {t.id === 'favs' && colorsData.favorites.length > 0 ? ` ${colorsData.favorites.length}` : ''}
                  </button>
                ))}
              </div>
              <span className="ml-auto" />
              {formatSwitch}
            </div>

            <div data-nodrag className="mt-2 flex-1 min-h-0 overflow-y-auto pr-1">
              {tab === 'wall' && (
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {['全部', ...COLOR_FAMILIES].map((f) => (
                      <button
                        key={f}
                        type="button"
                        data-color-family={f}
                        onClick={() => setFamily(f)}
                        className={`rounded-full px-2 py-1 text-[11px] border transition-colors ${
                          family === f
                            ? 'bg-indigo-500/25 text-white border-indigo-400/40'
                            : 'bg-white/[0.04] text-white/55 border-white/10 hover:bg-white/[0.08] hover:text-white'
                        }`}
                      >
                        {f === '全部' ? t('colors.allFamilies') : f}
                      </button>
                    ))}
                    <label className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 min-w-0">
                      <Search size={12} className="text-white/40 shrink-0" />
                      <input
                        data-colors-search
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('colors.searchPlaceholder')}
                        className="w-28 sm:w-36 bg-transparent text-xs text-white/85 placeholder:text-white/30 outline-none"
                      />
                    </label>
                  </div>

                  {/* 详情条：悬停（桌面）/长按（触屏）色格浮出，三格式各行可单独复制 */}
                  {detail && (
                    <div data-color-detail className="mt-2 flex items-stretch gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5">
                      <div className="w-14 rounded-xl ring-1 ring-black/25 shrink-0" style={{ backgroundColor: detail.hex }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-white/90 leading-tight">
                          {detail.name}
                          <span className="ml-2 text-xs font-normal text-white/45">{detail.pinyin}</span>
                          <span className="ml-2 text-xs font-normal text-white/45">{t('colors.familyLine', { family: detail.family })}</span>
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5">
                          {FORMAT_OPTIONS.map((f) => (
                            <button
                              key={f.id}
                              type="button"
                              data-color-detail-value={f.id}
                              onClick={() => copyColor(detail, f.id)}
                              className="text-xs text-white/65 hover:text-white transition-colors"
                            >
                              <span className="text-white/35 mr-1">{f.label}</span>
                              {colorValueOf(detail, f.id)}
                            </button>
                          ))}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-color-fav={detail.name}
                        aria-label={colorsData.favorites.includes(detail.name) ? t('colors.unfavColor', { name: detail.name }) : t('colors.favColor', { name: detail.name })}
                        onClick={() => toggleFavorite(detail.name)}
                        className="self-start flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] border border-white/10 text-white/70 hover:text-white shrink-0"
                      >
                        <Star
                          size={14}
                          fill={colorsData.favorites.includes(detail.name) ? 'currentColor' : 'none'}
                          className={colorsData.favorites.includes(detail.name) ? 'text-amber-300' : ''}
                        />
                      </button>
                    </div>
                  )}

                  <p className="mt-2 text-[11px] text-white/35" data-colors-wall-count>
                    {t('colors.wallCount', { n: wallColors.length })}
                  </p>
                  <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-5 gap-1.5 pb-1">
                    {wallColors.map((c) => renderCell(c))}
                  </div>
                  {wallColors.length === 0 && <p className="py-8 text-center text-xs text-white/35">{t('colors.wallEmpty')}</p>}
                </div>
              )}

              {tab === 'palettes' && (
                <div className="flex flex-col gap-2.5 pb-1">
                  {/* 随机配色（借鉴 Coolors 锁定玩法，色池只用 158 传统色） */}
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white/90">{t('colors.randomTitle')}</p>
                      <span className="text-[11px] text-white/35">{t('colors.randomHint')}</span>
                      <span className="ml-auto" />
                      <button
                        type="button"
                        data-random-roll
                        onClick={reroll}
                        className="flex items-center gap-1 rounded-lg bg-indigo-500/85 hover:bg-indigo-500 px-2.5 py-1.5 text-xs text-white font-medium transition-colors"
                      >
                        <Shuffle size={12} />
                        {t('colors.rollRandom')}
                      </button>
                      <button
                        type="button"
                        data-random-save
                        onClick={saveRandom}
                        className="rounded-lg bg-white/[0.05] border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.09] hover:text-white transition-colors"
                      >
                        {t('colors.saveRandom')}
                      </button>
                    </div>
                    <div className="mt-2.5 flex gap-1 h-16">
                      {randomSet.map((c, i) => (
                        <div key={`${c.name}-${i}`} className="group/lock relative flex-1 min-w-0">
                          <button
                            type="button"
                            data-random-band={c.name}
                            aria-label={t('colors.copyColor', { name: c.name })}
                            onClick={() => copyColor(c, format)}
                            className="h-full w-full rounded-lg ring-1 ring-black/20 flex items-end justify-center pb-1 transition-transform hover:scale-[1.02]"
                            style={{ backgroundColor: c.hex }}
                          >
                            <span className="text-[10px] truncate px-0.5" style={{ color: readableTextOn(c) }}>
                              {c.name}
                            </span>
                          </button>
                          <button
                            type="button"
                            data-random-lock={i}
                            aria-label={locks[i] ? t('colors.unlockN', { n: i + 1 }) : t('colors.lockN', { n: i + 1 })}
                            onClick={() => setLocks((prev) => prev.map((v, j) => (j === i ? !v : v)))}
                            className={`absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/35 text-white transition-opacity ${
                              locks[i] ? 'opacity-100' : 'opacity-0 group-hover/lock:opacity-100'
                            }`}
                          >
                            {locks[i] ? <Lock size={11} /> : <LockOpen size={11} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {TRADITIONAL_PALETTES.map((p) => {
                    const colors = p.colors.map(colorByName).filter((c): c is TraditionalColor => !!c);
                    return (
                      <div key={p.name} data-palette={p.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-white/90">{p.name}</p>
                          <span className="text-[11px] text-white/35 truncate">{p.note}</span>
                          <span className="ml-auto" />
                          <button
                            type="button"
                            data-palette-copy={p.name}
                            onClick={() => copyPalette(p.name, colors)}
                            className="flex items-center gap-1 rounded-lg bg-white/[0.05] border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.09] hover:text-white transition-colors shrink-0"
                          >
                            <Copy size={12} />
                            {t('colors.copyGroup')}
                          </button>
                        </div>
                        <div className="mt-2.5 h-14">{renderBands(colors, { labels: true, rootClass: 'h-full' })}</div>
                      </div>
                    );
                  })}
                </div>
              )}

              {tab === 'favs' && (
                <div className="pb-1">
                  {favColors.length === 0 && colorsData.savedPalettes.length === 0 ? (
                    <div className="py-10 text-center">
                      <p className="text-sm text-white/50">{t('colors.favsEmpty')}</p>
                      <p className="mt-1 text-xs text-white/35">{t('colors.favsEmptyHint')}</p>
                      <button
                        type="button"
                        data-favs-goto-wall
                        onClick={() => setTab('wall')}
                        className="mt-4 rounded-lg bg-indigo-500/85 hover:bg-indigo-500 px-3 py-2 text-xs text-white font-medium transition-colors"
                      >
                        {t('colors.gotoWall')}
                      </button>
                    </div>
                  ) : (
                    <>
                      {favColors.length > 0 && (
                        <>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-white/90">{t('colors.favColors')}</p>
                            <span className="ml-auto" />
                            <button
                              type="button"
                              data-fav-copy-all
                              onClick={() => {
                                const text = favColors.map((c) => colorValueOf(c, 'hex')).join(', ');
                                void copyText(text).then((ok) => {
                                  if (ok) showToast(t('colors.copiedAllFavs', { n: favColors.length }));
                                });
                              }}
                              className="flex items-center gap-1 rounded-lg bg-white/[0.05] border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.09] hover:text-white transition-colors"
                            >
                              <Copy size={12} />
                              {t('colors.copyAllFavs')}
                            </button>
                          </div>
                          <div className="mt-2 grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                            {favColors.map((c) => renderCell(c))}
                          </div>
                        </>
                      )}
                      {colorsData.savedPalettes.length > 0 && (
                        <div className="mt-4 flex flex-col gap-2.5">
                          <p className="text-sm font-medium text-white/90">{t('colors.myPalettes')}</p>
                          {colorsData.savedPalettes.map((p, i) => {
                            const colors = p.colors.map(colorByName).filter((c): c is TraditionalColor => !!c);
                            return (
                              <div key={`${p.name}-${i}`} data-saved-palette={p.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm text-white/85">{p.name}</p>
                                  <span className="ml-auto" />
                                  <button
                                    type="button"
                                    data-palette-copy={p.name}
                                    onClick={() => copyPalette(p.name, colors)}
                                    className="flex items-center gap-1 rounded-lg bg-white/[0.05] border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/[0.09] hover:text-white transition-colors"
                                  >
                                    <Copy size={12} />
                                    {t('colors.copyGroup')}
                                  </button>
                                  <button
                                    type="button"
                                    data-saved-palette-remove={p.name}
                                    aria-label={t('colors.deletePalette', { name: p.name })}
                                    onClick={() => removeSavedPalette(i)}
                                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] border border-white/10 text-white/55 hover:text-white"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                                <div className="mt-2.5 h-14">{renderBands(colors, { labels: true, rootClass: 'h-full' })}</div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 复制轻提示：对勾 + 文案，短时自收（与商店「已添加」同形态语言） */}
        {toast && (
          <div
            key={toast.id}
            data-copy-toast
            className="pointer-events-none absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/85 py-1.5 pl-2.5 pr-3 text-xs text-white shadow-lg ring-1 ring-white/15"
          >
            {toast.hex && <span className="h-3 w-3 rounded-full ring-1 ring-white/40" style={{ backgroundColor: toast.hex }} />}
            <Check size={13} className="text-emerald-300" />
            {toast.text}
          </div>
        )}
      </div>
    </Card>
  );
}
