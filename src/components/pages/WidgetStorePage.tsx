import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Minus, Plus, Search, Star } from 'lucide-react';
import {
  WIDGET_TINTS,
  widgetCardKey,
  widgetTintOf,
  type LocalStore,
  type WidgetId,
  type WidgetLayout,
} from '../../store/localStore';
import {
  WIDGET_CATEGORIES,
  WIDGET_DEFINITIONS,
  sameWidgetSize,
  widgetCategoryLabelText,
  widgetDefOf,
  widgetDisplayDesc,
  widgetDisplayName,
  widgetSizeLabel,
  type WidgetCategory,
} from '../v2/widgetRegistry';
import { useDisplayPrefs } from '../../store/displayPrefs';
import { useLang } from '../../i18n/useLang';

/**
 * 组件商店页（第七十四轮，按已定稿线稿落地）：
 * - 左区：列表块——分类页签（全部 / 精选 / 工具 / 外观）+ 搜索在块顶，组件网格瓷砖（两栏布局时
 *   3 列、堆叠时 1 列，第七十七轮追加修正），块内滚动，选中描边；
 * - 右区：上详情（名称/简介/分类/支持尺寸/联网与数据声明）、下预览——按真实尺寸渲染活的组件本体，
 *   切尺寸时预览真实变形并标注当前尺寸；预览区只展示不可操作（pointer-events-none），防误触改到真实数据；
 * - 底部全宽操作条：尺寸选择与预览联动；未添加 → 「添加到主页」按所选尺寸添加并留在本页给反馈
 *   （瓷砖与详情同步出现「已添加」、操作条出现确认提示）；已添加 → 尺寸选择即时同步主页布局（与右键
 *   尺寸菜单同一通道），另有「移除」（沿用 setWidgetVisible 口径：移除不删数据，重加原样恢复）。
 * 组件全集、分类、尺寸声明一律读统一注册表（widgetRegistry），本页不自带组件清单。
 * 热度信号按规范 5.4：只有维护者精选 featured 与页脚的 GitHub 仓库链接，不做评分/下载量。
 * 第七十七轮：本页接入外观三档（商店大面归编组卡同源表面 .store-panel，见 index.css
 * 第七十七轮节）；操作条只在 ≥sm 悬浮 sticky，手机端回普通文档流排在内容末尾
 * （用户口径原话：「这一块在手机看悬浮了，不用做悬浮」）；列表瓷砖改密排
 * （两栏时 3 列、堆叠时 1 列，用户口径：「做成 B 卡的网页尺寸」）。
 */

type StoreTab = 'all' | 'featured' | WidgetCategory;

/** 预览的自然像素尺寸：按桌面网格参考值（栏宽 368 + 间距 16、行高 176/368）折算，
 * 舞台按容器实际宽度等比缩放（见 PreviewStage），任何视口下不溢出、不裁切 */
function naturalSize(layout: WidgetLayout): { w: number; h: number } {
  return { w: layout.colSpan === 2 ? 752 : 368, h: layout.heightUnits === 2 ? 368 : 176 };
}

/** 预览舞台：内层按自然尺寸渲染组件本体，外层测宽后等比缩放（transform），高度按缩放后折算 */
function PreviewStage({ layout, children }: { layout: WidgetLayout; children: React.ReactNode }) {
  const { w, h } = naturalSize(layout);
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / w));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={ref} data-store-stage className="w-full overflow-hidden" style={{ height: Math.round(h * scale) }}>
      <div
        className="pointer-events-none select-none"
        style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  );
}

export default function WidgetStorePage({
  store,
  onNavigate,
}: {
  store: LocalStore;
  onNavigate: (page: string) => void;
}) {
  const { t, lang } = useLang();
  const [tab, setTab] = useState<StoreTab>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<WidgetId>(
    () => (WIDGET_DEFINITIONS.find((d) => d.featured) ?? WIDGET_DEFINITIONS[0]).id,
  );
  /** 用户在本页手动选过的尺寸（按组件记）；未选过时：已添加取主页现行尺寸、未添加取注册默认尺寸 */
  const [sizePick, setSizePick] = useState<Partial<Record<WidgetId, WidgetLayout>>>({});
  /** 刚添加成功的组件 id（操作条确认提示，数秒后自动收起；瓷砖/详情的「已添加」标识是常驻反馈） */
  const [justAdded, setJustAdded] = useState<WidgetId | null>(null);
  useEffect(() => {
    if (!justAdded) return;
    const t = setTimeout(() => setJustAdded(null), 4000);
    return () => clearTimeout(t);
  }, [justAdded]);

  /* 第七十七轮 · 外观接入：商店大面（列表块/详情块/预览外框/操作条）归编组卡同源
     表面——挂 .store-panel 走 index.css 的底色口径（暗夜沿用写死 #17171d 不变、
     白天同 B 卡变量翻白，tint 同归 groupCardAlpha）；
     列表块/详情块/操作条另挂 .group-card-scope 复用白天翻字作用域（C 卡同款接法）。
     预览外框**不挂** scope：里面的组件本体是 A 型组件、与主页一样永不进编组卡作用域，
     外框自有文字（标题/尺寸标注/脚注）改按 theme 条件类在白天翻深（下方 light 变量）。
     （第一百零二轮：原玻璃档的折射接法已随液态玻璃整体删除。） */
  const { theme } = useDisplayPrefs();
  const light = theme === 'light';

  const tabs: { id: StoreTab; label: string }[] = [
    { id: 'all', label: t('store.tabAll') },
    { id: 'featured', label: t('store.tabFeatured') },
    ...WIDGET_CATEGORIES.map((c) => ({ id: c.id as StoreTab, label: widgetCategoryLabelText(c.id, t) })),
  ];

  const addedIds = store.data.widgets;
  const def = widgetDefOf(selectedId);
  const defName = widgetDisplayName(def, t);
  const defDesc = widgetDisplayDesc(def, t);
  const isAdded = addedIds.includes(def.id);
  const currentLayout = store.data.widgetLayouts[def.id] ?? def.defaultLayout;
  const activeSize = sizePick[def.id] ?? (isAdded ? currentLayout : def.defaultLayout);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WIDGET_DEFINITIONS.filter((d) => {
      if (tab === 'featured' && !d.featured) return false;
      if ((tab === 'tools' || tab === 'appearance') && d.category !== tab) return false;
      // 中文原文与当前语言译名都参与匹配，EN 下搜英文名也能命中
      if (q && !`${d.name} ${d.desc} ${widgetDisplayName(d, t)} ${widgetDisplayDesc(d, t)}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [tab, query, lang]);

  /** 预览底色：已分配的用已分配的；未添加组件尚未分配底色，预览临时挑一个同屏未用色（不落盘，
   * 真正添加后由主页的补抽逻辑正式分配，颜色可能与预览不同——底色本就是首次出现时随机抽的） */
  const previewTint = useMemo(() => {
    const assigned = widgetTintOf(store.data.widgetTints, widgetCardKey(def.id));
    if (assigned) return assigned;
    const used = new Set<number>();
    for (const id of addedIds) {
      const v = store.data.widgetTints[widgetCardKey(id)];
      if (typeof v === 'number') used.add(v);
    }
    const free = WIDGET_TINTS.findIndex((_, i) => !used.has(i));
    return WIDGET_TINTS[free >= 0 ? free : 0];
  }, [def.id, store.data.widgetTints, addedIds]);

  const pickSize = (layout: WidgetLayout) => {
    setSizePick((prev) => ({ ...prev, [def.id]: layout }));
    // 已添加组件：在商店里改尺寸即时同步主页（与主页右键尺寸菜单同一条 store 通道）
    if (isAdded) store.setWidgetLayout(def.id, layout);
  };

  const addSelected = () => {
    store.setWidgetLayout(def.id, activeSize);
    store.setWidgetVisible(def.id, true);
    setJustAdded(def.id);
  };

  const PreviewComp = def.component;

  return (
    <div data-widget-store data-store-root className="flex flex-col gap-4">
      {/* 页头：标题 + 仓库链接（规范 5.4：项目级热度信号链回 GitHub） */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{t('store.title')}</h2>
          <p className="text-xs sm:text-sm text-white/45 mt-1">{t('store.subtitle')}</p>
        </div>
        <a
          href="https://github.com/0waitgoo/zabox"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-xs text-white/55 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1.5 transition-colors"
        >
          <Star size={13} /> {t('store.githubRepo')}
        </a>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
        {/* 左区：列表块（分类 + 搜索在块顶，两列瓷砖，块内滚动） */}
        <section
          data-store-list
          className="group-card-scope store-panel rounded-[24px] bg-[#17171d] border border-white/12 flex flex-col overflow-hidden h-[400px] lg:h-auto lg:min-h-[560px]"
        >
          <div className="p-3 pb-2.5 border-b border-white/8 shrink-0">
            <div className="flex gap-1.5 overflow-x-auto pb-2.5" data-store-tabs>
              {tabs.map((tabItem) => (
                <button
                  key={tabItem.id}
                  data-store-tab={tabItem.id}
                  onClick={() => setTab(tabItem.id)}
                  className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-colors ${
                    tab === tabItem.id ? 'bg-indigo-500/85 text-white font-medium' : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {tabItem.label}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35 pointer-events-none" />
              <input
                data-store-search
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('store.searchPlaceholder')}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-indigo-400/50 placeholder:text-white/30"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {filtered.length > 0 ? (
              /* 第七十七轮追加修正（用户口径：「小组件的选项做成 B 卡的网页尺寸，2 栏显示
                 3 列，1 栏显示 1 列」）：列数跟随本页布局断点 lg——整页两栏时列表块为
                 2 栏宽、瓷砖 3 列密排（对齐 B 卡站点瓷砖的规格感）；堆叠时列表块 1 栏宽、
                 瓷砖整行 1 列。不留 2 列中间态。 */
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
                {filtered.map((d) => {
                  const selected = d.id === selectedId;
                  const added = addedIds.includes(d.id);
                  const Icon = d.icon;
                  const tileName = widgetDisplayName(d, t);
                  const tileDesc = widgetDisplayDesc(d, t);
                  return (
                    <button
                      key={d.id}
                      data-store-tile={d.id}
                      onClick={() => setSelectedId(d.id)}
                      className={`text-left rounded-2xl border p-3 transition-colors ${
                        selected
                          ? 'border-indigo-400/80 bg-indigo-500/12 ring-1 ring-indigo-400/50'
                          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.05]'
                      }`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="w-9 h-9 rounded-xl bg-white/8 flex items-center justify-center text-white/85 shrink-0">
                          <Icon size={17} />
                        </span>
                        <span className="flex flex-col items-end gap-1">
                          {d.featured && (
                            <span data-store-badge="featured" className="flex items-center gap-0.5 text-[10px] text-amber-300 bg-amber-400/10 border border-amber-300/25 rounded-full px-1.5 py-0.5">
                              <Star size={9} /> {t('store.featured')}
                            </span>
                          )}
                          {added && (
                            <span data-store-added-badge data-store-badge="added" className="flex items-center gap-0.5 text-[10px] text-emerald-300">
                              <Check size={10} /> {t('store.added')}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="block mt-2 text-sm font-medium leading-tight">{tileName}</span>
                      <span className="block mt-0.5 text-[11px] text-white/40 leading-snug line-clamp-2">{tileDesc}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
                <p className="text-sm text-white/50">
                  {tab === 'appearance' && !query.trim() ? t('store.emptyAppearance') : t('store.emptyNone')}
                </p>
                <p className="text-[11px] text-white/35 mt-1.5 leading-relaxed">
                  {tab === 'appearance' && !query.trim()
                    ? t('store.emptyAppearanceNote')
                    : t('store.emptyHint')}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 右区：上详情、下预览 */}
        <section className="flex flex-col gap-4 min-w-0">
          <div
            data-store-detail
            className="group-card-scope store-panel rounded-[24px] bg-[#17171d] border border-white/12 p-4"
          >
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-2xl bg-white/8 flex items-center justify-center text-white/90 shrink-0">
                <def.icon size={20} />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-semibold">{defName}</span>
                  <span className="text-[10px] text-white/60 bg-white/8 border border-white/10 rounded-full px-2 py-0.5">
                    {widgetCategoryLabelText(def.category, t)}
                  </span>
                  {def.featured && (
                    <span data-store-badge="featured" className="flex items-center gap-0.5 text-[10px] text-amber-300 bg-amber-400/10 border border-amber-300/25 rounded-full px-2 py-0.5">
                      <Star size={9} /> {t('store.curatorFeatured')}
                    </span>
                  )}
                  {isAdded && (
                    <span data-store-badge="added" className="flex items-center gap-0.5 text-[10px] text-emerald-300 bg-emerald-400/10 border border-emerald-300/25 rounded-full px-2 py-0.5">
                      <Check size={9} /> {t('store.onHome')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-white/45 mt-0.5">{defDesc}</p>
              </div>
            </div>
            <div className="mt-3.5 flex flex-col gap-2 text-[11px] leading-relaxed">
              <p className="flex gap-2 flex-wrap">
                <span className="text-white/35 shrink-0">{t('store.supportedSizes')}</span>
                <span className="flex gap-1.5 flex-wrap">
                  {def.supportedSizes.map((s) => (
                    <span
                      key={`${s.colSpan}x${s.heightUnits}`}
                      className={`rounded-md px-1.5 py-0.5 border ${
                        sameWidgetSize(s, activeSize)
                          ? 'border-indigo-400/60 text-indigo-200 bg-indigo-500/15'
                          : 'border-white/12 text-white/55 bg-white/[0.04]'
                      }`}
                    >
                      {widgetSizeLabel(s, t)}
                    </span>
                  ))}
                </span>
              </p>
              <p className="flex gap-2">
                <span className="text-white/35 shrink-0">{t('store.defaultSize')}</span>
                <span className="text-white/65">{widgetSizeLabel(def.defaultLayout, t)}</span>
              </p>
              <p className="flex gap-2">
                <span className="text-white/35 shrink-0">{t('store.networkDecl')}</span>
                <span className="text-white/65">
                  {def.network
                    ? def.network.map((n) => `${n.endpoint} — ${n.purposeKey ? t(n.purposeKey) : n.purpose}`).join(lang === 'en' ? '; ' : '；')
                    : t('store.noNetwork')}
                </span>
              </p>
              <p className="flex gap-2">
                <span className="text-white/35 shrink-0">{t('store.storageLabel')}</span>
                <span className="text-white/65">
                  {def.storage && typeof def.storage === 'object'
                    ? t('store.storageOwn', { own: def.storage.own, reason: def.storage.reasonKey ? t(def.storage.reasonKey) : def.storage.reason })
                    : def.storage === 'device'
                      ? t('store.storageDevice')
                      : t('store.storageStore')}
                </span>
              </p>
            </div>
          </div>

          <div
            data-store-preview
            className="store-panel rounded-[24px] bg-[#17171d] border border-white/12 p-4"
          >
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className={`text-xs font-medium ${light ? 'text-black/60' : 'text-white/60'}`}>{t('store.livePreview')}</p>
              <span
                data-store-size-label
                className={`text-[11px] rounded-full px-2 py-0.5 border ${
                  light ? 'text-indigo-700 bg-indigo-600/10 border-indigo-500/35' : 'text-indigo-200 bg-indigo-500/15 border-indigo-400/40'
                }`}
              >
                {t('store.currentSize', { size: widgetSizeLabel(activeSize, t) })}
              </span>
            </div>
            <PreviewStage layout={activeSize}>
              <PreviewComp
                key={`${def.id}-${activeSize.colSpan}x${activeSize.heightUnits}`}
                store={store}
                onNavigate={onNavigate}
                tint={previewTint}
                layout={activeSize}
              />
            </PreviewStage>
            <p className={`text-[10px] mt-2.5 ${light ? 'text-black/40' : 'text-white/30'}`}>{t('store.previewNote')}</p>
          </div>
        </section>
      </div>

      {/* 底部全宽操作条：尺寸选择（与预览联动） + 添加/移除。
          悬浮只限 ≥sm（sticky 吸底 + 深影，第74轮桌面呈现）；手机端回普通文档流排在
          内容末尾、随页滚动、不遮挡预览（第七十七轮追加修正，用户：「手机看悬浮了，
          不用做悬浮」）——故 sticky/bottom/z/深影全部收进 sm: 前缀，<sm 无任何定位类。
          本页没有为悬浮预留过额外底部 padding/占位（sticky 本就占自身文档位），无需清理。 */}
      <div
        data-store-actionbar
        className="group-card-scope store-panel rounded-[24px] bg-[#17171d] border border-white/12 px-3 py-3 sm:px-4 flex items-center gap-2.5 flex-wrap sm:sticky sm:bottom-3 sm:z-10 sm:shadow-2xl sm:shadow-black/50"
      >
        <span className="text-xs text-white/50 shrink-0">{isAdded ? t('store.homeSize') : t('store.addSize')}</span>
        <div className="flex gap-1.5 flex-wrap">
          {def.supportedSizes.map((s) => {
            const selected = sameWidgetSize(s, activeSize);
            return (
              <button
                key={`${s.colSpan}x${s.heightUnits}`}
                data-store-size={`${s.colSpan}x${s.heightUnits}`}
                onClick={() => pickSize(s)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                  selected ? 'bg-indigo-500/85 text-white font-medium' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {selected && <Check size={12} />}
                {widgetSizeLabel(s, t)}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        {justAdded === def.id && (
          <span data-store-added-note data-store-badge="added" className="flex items-center gap-1 text-xs text-emerald-300">
            <Check size={13} /> {t('store.addedToHome')}
          </span>
        )}
        {isAdded ? (
          <>
            <button
              onClick={() => onNavigate('home')}
              className="px-3 py-2 rounded-xl bg-indigo-500/85 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              {t('store.goHome')}
            </button>
            <button
              data-store-remove
              onClick={() => store.setWidgetVisible(def.id, false)}
              className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/8 hover:bg-white/12 text-white/75 text-sm transition-colors"
            >
              <Minus size={13} /> {t('store.remove')}
            </button>
          </>
        ) : (
          <button
            data-store-add
            onClick={addSelected}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500/85 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            <Plus size={14} /> {t('store.addToHome')}
          </button>
        )}
      </div>
      <p className="text-[11px] text-white/30 text-center">{t('store.removeNote')}</p>
    </div>
  );
}
