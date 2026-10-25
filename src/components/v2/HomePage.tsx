import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { LayoutGrid, FolderPlus, X, Check, List, Folder, Unlink, Combine, Palette, LogOut, ChevronDown } from 'lucide-react';
import { GROUP_NAME_MAX, clampGroupName, textCharCount, type GroupDisplay, type NavGroup } from '../../data/groups';
import {
  cardFaceStyleOf,
  clampColSpan,
  comboCardKey,
  groupCardKey,
  groupLayoutOf,
  pickWidgetTintIndex,
  resolveCardOrder,
  stackLayoutOf,
  widgetCardKey,
  widgetStackCardKey,
  widgetTintOf,
  WIDGET_STACK_MAX,
  WIDGET_TINTS,
  type CardFaceStyle,
  type ComboItem,
  type LocalStore,
  type WidgetId,
  type WidgetLayout,
  type WidgetMergeEntity,
  type WidgetStackItem,
} from '../../store/localStore';
import { placeInLanes, simulateDenseFlow, type LaneItemSpec } from './laneLayout';
import StickySearch from './StickySearch';
import DataMenu from './DataMenu';
import PwaInstallButton from './PwaInstallButton';
import PresetMenu from './PresetMenu';
import { TopLogo, TopNav } from '../Sidebar';
import { closeToolsWorkspace, useToolsWorkspace } from '../../store/toolsWorkspace';
import { closeColorsWorkspace, useColorsWorkspace } from '../../store/colorsWorkspace';
import { WIDGET_DEFINITIONS, widgetDefOf } from './widgetRegistry';
import GroupListCard from './GroupListCard';
import GroupStackCard, { StackGroupIcon } from './GroupStackCard';
import GroupPanel from './GroupPanel';
import ComboCard from './ComboCard';
import ComboPanel from './ComboPanel';
import WidgetStackCard from './WidgetStackCard';
import { vivid } from './WidgetTint';
import useLongPressMenu from './useLongPressMenu';

/**
 * V2 新主页（第三轮修订 + 第五轮拖拽排序 + 第八轮顶栏一行对齐）
 * - 无顶部标题栏：页面直接从吸顶栏开始——同一行内左半（2 栏）放页面导航图标组、右半（2 栏）放搜索框 + 低调的「数据」入口（导出/导入），整条栏吸顶
 * - 4 栏基准网格（桌面 4 栏 / 平板 2 栏 / 手机 1 栏单列，第六十六轮）
 * - B 型编组（display=list）：主页原地向下拉开 + 卡内滚动；C 型编组（display=stack）：点击弹窗看 ICON 瓷砖
 * - A 型原生组件与编组（B/C 型）可右键改尺寸（1/2 栏 × 1x/2x，宽度最多 2 栏），布局存本地；C 型缺省 1 栏 × 1x
 * - 全部卡片（编组 + 原生组件）可按住拖拽排序：超过阈值才判定拖拽，普通点击不受影响；顺序存本地
 * - 全部编组与布局来自本地存储（方案三：本地优先），用户可增删改
 * - 第三十四轮：排放改为按栏锚定（见 laneLayout.ts）——卡片钉在自己的栏里往下排，
 *   空栏留空、不再自动往左边收；拖拽落点按指针所在栏 + 栏内插入位决定，只动被拖卡的锚点
 */

/** 「换个底色」选色面板的一行（第九十一轮）：色名 + 原生取色块 + 色值 + 一排预设色板快捷点。
 *  取色块用原生 input[type=color]（值须小写 #rrggbb），点选/取色都即时回调落盘，
 *  卡面与面板预览条同步变色（同一条渲染链）。 */
function TintColorRow({
  slot,
  label,
  value,
  swatches,
  onPick,
}: {
  slot: 'from' | 'to';
  label: string;
  value: string;
  swatches: string[];
  onPick: (hex: string) => void;
}) {
  const lower = value.toLowerCase();
  return (
    <div className="pb-2">
      <div className="flex items-center gap-2 pb-1.5">
        <span className="w-9 shrink-0 text-[11px] text-white/60">{label}</span>
        <label
          className="relative h-6 w-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-white/25"
          style={{ backgroundColor: lower }}
          title="点开取色器自选颜色"
        >
          <input
            type="color"
            data-tint-input={slot}
            value={lower}
            onChange={(e) => onPick(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <span className="text-[10px] uppercase tracking-wide text-white/40">{lower}</span>
      </div>
      <div className="flex gap-1 pl-11">
        {swatches.map((hex) => (
          <button
            key={hex}
            data-tint-swatch={`${slot}:${hex.toLowerCase()}`}
            onClick={() => onPick(hex)}
            title={hex}
            className={`h-4 w-4 rounded-full border transition-transform hover:scale-110 ${
              lower === hex.toLowerCase() ? 'border-white ring-1 ring-white/70' : 'border-white/25'
            }`}
            style={{ backgroundColor: hex }}
          />
        ))}
      </div>
    </div>
  );
}

/** 两个虚线入口块在放置计算里的伪 key（不算卡、无锚点，回落到最矮栏末尾） */
const TILE_ADD_KEY = '__tile_add__';
const TILE_NEW_KEY = '__tile_new__';

/** 向上查找最近的可滚动祖先（拖拽到边缘时自动滚动用） */
function findScrollAncestor(el: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node && node !== document.body) {
    const oy = window.getComputedStyle(node).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}
export default function HomePage({ onNavigate, store }: { onNavigate: (page: string) => void; store: LocalStore }) {
  /* 原位长按触发右键菜单（第七十轮）：合成 contextmenu 事件走既有三层右键路由 */
  useLongPressMenu();
  const { groups, widgets, widgetLayouts, groupLayouts } = store.data;
  /* 文件工具工作区状态（第八十六轮）：打开时本页要把文件工具卡（或含它的摞）
   * 的栏位高度抬高；状态本体在 toolsWorkspace store。原顶栏扳手定位已于
   * 第一百零六轮随扳手改预设入口下线，工作区只由文件工具卡自身开关 */
  const toolsWs = useToolsWorkspace();
  /* 中式色卡工作区状态（第一百零七轮）：与文件工具同制，打开时栏位高度抬到 2 倍 */
  const colorsWs = useColorsWorkspace();
  /* 视口三档（第六十六轮起）：≥lg（1024px）为 4 栏；640–1023（平板）为 2 栏；
   * <640（手机）为 1 栏单列。数据始终按 4 栏锚点存；2 栏呈现时 4 个锚点栏两两合并
   * （0,1→左、2,3→右），1 栏呈现时只按顺序纵向堆叠、锚点不参与（见 placements）。
   * 此前只有两档：手机与平板同走 2 栏，390px 下 span-1 卡仅 177px 半屏宽——即用户
   * 「卡片被挤在左侧约半屏窄列」的根因；高度又是固定行高（158px/行）与内容无关，
   * 2x 组合卡内容不满时整段空白。手机单列 + 按内容估算行高一并在本轮解决。 */
  const [viewportWidth, setViewportWidth] = useState<number>(
    () => (typeof window === 'undefined' ? 1280 : window.innerWidth),
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const wideViewport = viewportWidth >= 1024;
  const phoneViewport = viewportWidth < 640;
  const visualCols: 1 | 2 | 4 = wideViewport ? 4 : phoneViewport ? 1 : 2;
  const visualColsRef = useRef(visualCols);
  visualColsRef.current = visualCols;
  const gridRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [panelGroupId, setPanelGroupId] = useState<string | null>(null);
  const [comboPanelId, setComboPanelId] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDisplay, setNewGroupDisplay] = useState<GroupDisplay>('stack');
  /** 右键尺寸菜单的目标：原生组件 / 编组 / 组合卡（共用同一套菜单，组合卡多一项「拆分组合」） */
  type SizeMenuTarget =
    | { kind: 'widget'; id: WidgetId }
    | { kind: 'group'; id: string }
    | { kind: 'combo'; id: string }
    | { kind: 'wstack'; id: string };
  const [sizeMenu, setSizeMenu] = useState<(SizeMenuTarget & { x: number; y: number }) | null>(null);
  const sizeMenuRef = useRef<HTMLDivElement>(null);
  /** 「换个底色」选色面板的展开状态（第九十一轮）：记卡片 key，菜单关掉/换个目标自然对不上即收起 */
  const [tintPanelFor, setTintPanelFor] = useState<string | null>(null);
  /** 空白处右键菜单（第二十七轮）：新建组合 / 添加组件；只在非卡片、非弹窗、非顶栏区域触发 */
  const [blankMenu, setBlankMenu] = useState<{ x: number; y: number } | null>(null);
  const blankMenuRef = useRef<HTMLDivElement>(null);
  /** 新建组合选择器：勾选恰好 2 个候选组后生成组合卡 */
  const [showComboPicker, setShowComboPicker] = useState(false);
  const [pickerSelected, setPickerSelected] = useState<string[]>([]);
  /** 拖拽合并提示（充能完成后压住的目标卡），由拖拽逻辑写入、渲染层在目标卡上画高亮；
   *  kind 区分编组组合与组件摞两套合并（第七十二轮），full = 目标是摞但已满 4 个（拒绝反馈） */
  const [mergeUi, setMergeUi] = useState<{
    targetKey: string;
    progress: number;
    ready: boolean;
    kind?: 'group' | 'widget';
    full?: boolean;
  } | null>(null);
  /** 拖拽充能进度（拖影上的提示条），可合并的卡（编组 stack 卡 / 小组件 / 组件摞）拖拽时出现 */
  const [chargeUi, setChargeUi] = useState<{ progress: number; ready: boolean; kind?: 'group' | 'widget' } | null>(null);
  /** tab 拖出时的拖影来源：把被拖组的普通 C 卡渲染到屏外，取其 HTML 作拖拽快照 */
  const [tabSnap, setTabSnap] = useState<{
    group: NavGroup;
    w: number;
    h: number;
    colSpan: 1 | 2;
    heightUnits: 1 | 2;
  } | null>(null);
  const tabSnapRef = useRef<HTMLDivElement>(null);

  const listGroups = useMemo(() => groups.filter((g) => g.display === 'list'), [groups]);
  const stackGroups = useMemo(() => groups.filter((g) => g.display === 'stack'), [groups]);

  /* ---------- C 卡组合（第二十一轮）：有效组合 = 两个成员都还在且仍为 stack 型；
     失效组合（成员被删/改型）渲染侧直接忽略，成员组按普通卡出现（store 归一化也会清） ---------- */
  const validCombos = useMemo(
    () =>
      store.data.combos.filter((c) => {
        const ga = groups.find((g) => g.id === c.groupIds[0]);
        const gb = groups.find((g) => g.id === c.groupIds[1]);
        return ga?.display === 'stack' && gb?.display === 'stack';
      }),
    [store.data.combos, groups],
  );
  const memberIds = useMemo(() => new Set(validCombos.flatMap((c) => c.groupIds)), [validCombos]);
  /** 未入组合的 stack 组才单独成卡（组合成员由组合卡代表） */
  const singleStackGroups = useMemo(() => stackGroups.filter((g) => !memberIds.has(g.id)), [stackGroups, memberIds]);

  /* ---------- A 型组件摞（第七十二轮）：归一化已保证成员都在 widgets 内、2–4 个且不重叠；
     渲染侧再兜一层防御过滤（成员不在 widgets 的摞不渲染，成员按普通组件出现） ---------- */
  const validWidgetStacks = useMemo(
    () =>
      store.data.widgetStacks.filter(
        (s) => s.widgetIds.length >= 2 && s.widgetIds.every((id) => widgets.includes(id)),
      ),
    [store.data.widgetStacks, widgets],
  );
  const stackedMemberIds = useMemo(
    () => new Set(validWidgetStacks.flatMap((s) => s.widgetIds)),
    [validWidgetStacks],
  );
  const [stackA, stackB, stackC, ...stackRest] = singleStackGroups;
  const hasWidget = (id: WidgetId) => widgets.includes(id);

  /* ---------- 文件工具工作区状态守卫（第八十六轮） ---------- */
  /* 组件被移除（如在商店页移除、或切到不含文件工具的预设）后工作区状态不能悬空：自动收起 */
  useEffect(() => {
    if (toolsWs.open && !widgets.includes('tools')) closeToolsWorkspace();
  }, [toolsWs.open, widgets]);
  /* 中式色卡同守卫（第一百零七轮） */
  useEffect(() => {
    if (colorsWs.open && !widgets.includes('colors')) closeColorsWorkspace();
  }, [colorsWs.open, widgets]);
  const panelGroup = panelGroupId ? (groups.find((g) => g.id === panelGroupId) ?? null) : null;
  const comboPanel = comboPanelId ? (validCombos.find((c) => c.id === comboPanelId) ?? null) : null;
  const comboPanelGroups: [NavGroup, NavGroup] | null = comboPanel
    ? (() => {
        const ga = groups.find((g) => g.id === comboPanel.groupIds[0]);
        const gb = groups.find((g) => g.id === comboPanel.groupIds[1]);
        return ga && gb ? [ga, gb] : null;
      })()
    : null;
  /** 可参与新建组合的组：文件夹式且不在任何组合中（空白菜单「新建组合」的候选与置灰判定） */
  const comboCandidates = useMemo(
    () => groups.filter((g) => g.display === 'stack' && !memberIds.has(g.id)),
    [groups, memberIds],
  );

  /* ---------- 右键尺寸菜单（原生组件与 B 型编组共用） ---------- */
  /* 选色面板展开态随菜单关闭复位（第九十一轮）：任何路径关掉菜单后重开都是收起态 */
  useEffect(() => {
    if (!sizeMenu) setTintPanelFor(null);
  }, [sizeMenu]);
  useEffect(() => {
    if (!sizeMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (sizeMenuRef.current && !sizeMenuRef.current.contains(e.target as Node)) setSizeMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSizeMenu(null);
    };
    const onScroll = () => setSizeMenu(null);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [sizeMenu]);

  /* ---------- 空白处右键菜单（第二十七轮） ---------- */
  useEffect(() => {
    if (!blankMenu) return;
    const onPointerDown = (e: MouseEvent) => {
      if (blankMenuRef.current && !blankMenuRef.current.contains(e.target as Node)) setBlankMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBlankMenu(null);
    };
    const onScroll = () => setBlankMenu(null);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [blankMenu]);

  /** 页面菜单（新建组合/添加组件）的统一定位打开：React 空白处理器与原生兜底路由共用 */
  const openBlankMenuAtRef = useRef((clientX: number, clientY: number) => {
    void clientX;
    void clientY;
  });
  openBlankMenuAtRef.current = (clientX: number, clientY: number) => {
    const MENU_W = 208;
    const MENU_H = 132;
    setBlankMenu({
      x: Math.max(8, Math.min(clientX, window.innerWidth - MENU_W - 8)),
      y: Math.max(8, Math.min(clientY, window.innerHeight - MENU_H - 8)),
    });
  };

  /** 只在真正空白处触发：卡片（自有菜单）、弹窗/浮动层（.fixed）、吸顶导航条（.sticky）都跳过 */
  const handleBlankContextMenu = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-card-key]')) return;
    if (t.closest('.fixed')) return;
    if (t.closest('.sticky')) return;
    e.preventDefault();
    openBlankMenuAtRef.current(e.clientX, e.clientY);
  };

  /* 全局右键统一路由（第五十五轮）：上面的 React 处理器只覆盖根 div 内的真空白；
     站点图标（img）、顶栏、弹窗空白、页面边角等位置此前会漏出浏览器原生菜单。
     这里在 document 冒泡末段兜底：既有处理器（站点/卡片/任务/菜单自身）都会先
     preventDefault，defaultPrevented 的直接放行不干预；输入类元素保留原生菜单（粘贴）；
     其余一律拦截并出页面菜单。监听在冒泡末段（document）触发，天然晚于 React 根处理器。 */
  useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('input, textarea, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')) return;
      e.preventDefault();
      openBlankMenuAtRef.current(e.clientX, e.clientY);
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  const togglePickerGroup = (id: string) => {
    setPickerSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return prev; // 恰好 2 个：选满后需先取消已选才能换
      return [...prev, id];
    });
  };

  /** 选择器里生成组合卡：复用 mergeCombo，构造顺序让组合落在卡片顺序末尾；先选的组为左 tab */
  const createComboFromPicker = () => {
    if (pickerSelected.length !== 2) return;
    const [a, b] = pickerSelected;
    const order = [
      ...baseOrder.filter((k) => k !== groupCardKey(a) && k !== groupCardKey(b)),
      groupCardKey(a),
      groupCardKey(b),
    ];
    store.mergeCombo(a, b, order);
    setShowComboPicker(false);
    setPickerSelected([]);
  };

  const openSizeMenu = (e: React.MouseEvent, target: SizeMenuTarget) => {
    e.preventDefault();
    e.stopPropagation();
    const MENU_W = 208;
    // 任务卡的菜单多一节「卡面样式」、组合卡多一项「拆分组合」，更高一些；
    // A 型组件还多一项「换个底色」（第二十三轮），再加一截；第九十一轮起该项可展开
    // 选色面板（预览条 + 双色行 + 按钮行约 +190），按展开后的高度预留，免得贴底开菜单时面板溢出；
    // 摞另有拆分/移出两项。「合并到…」一节已于第一百零八轮删除（用户口径：拖拽合并即可）
    const MENU_H =
      target.kind === 'widget'
        ? target.id === 'task'
          ? 550
          : 454
        : target.kind === 'combo'
          ? 244
          : target.kind === 'wstack'
            ? 302
            : 196;
    setSizeMenu({
      ...target,
      x: Math.max(8, Math.min(e.clientX, window.innerWidth - MENU_W - 8)),
      y: Math.max(8, Math.min(e.clientY, window.innerHeight - MENU_H - 8)),
    });
  };

  /** 菜单当前目标的布局与改尺寸入口（组件走 widgetLayouts，编组/组合走 groupLayouts；
   *  编组按 display 取缺省：list 回落 2 栏 × 2x，stack 与组合回落 1 栏 × 1x） */
  const sizeMenuLayout: WidgetLayout | null = sizeMenu
    ? sizeMenu.kind === 'widget'
      ? widgetLayouts[sizeMenu.id]
      : sizeMenu.kind === 'combo'
        ? stackLayoutOf(groupLayouts, comboCardKey(sizeMenu.id))
        : sizeMenu.kind === 'wstack'
          ? stackLayoutOf(groupLayouts, widgetStackCardKey(sizeMenu.id))
          : (() => {
              const g = groups.find((gr) => gr.id === sizeMenu.id);
              return g?.display === 'stack' ? stackLayoutOf(groupLayouts, sizeMenu.id) : groupLayoutOf(groupLayouts, sizeMenu.id);
            })()
    : null;
  const sizeMenuTitle = sizeMenu
    ? sizeMenu.kind === 'widget'
      ? `${widgetDefOf(sizeMenu.id).name} · 组件尺寸`
      : sizeMenu.kind === 'combo'
        ? (() => {
            const c = validCombos.find((cc) => cc.id === sizeMenu.id);
            const names = c ? c.groupIds.map((gid) => groups.find((g) => g.id === gid)?.name ?? '').join(' + ') : '';
            return `${names} · 组合尺寸`;
          })()
        : sizeMenu.kind === 'wstack'
          ? (() => {
              const s = validWidgetStacks.find((ss) => ss.id === sizeMenu.id);
              const names = s ? s.widgetIds.map((wid) => widgetDefOf(wid).name).join(' + ') : '';
              return `${names} · 组件摞`;
            })()
          : `${groups.find((g) => g.id === sizeMenu.id)?.name ?? ''} · 编组尺寸`
    : '';
  const applySizeMenuLayout = (patch: Partial<WidgetLayout>) => {
    if (!sizeMenu) return;
    if (sizeMenu.kind === 'widget') store.setWidgetLayout(sizeMenu.id, patch);
    else if (sizeMenu.kind === 'combo') store.setComboLayout(sizeMenu.id, patch);
    else if (sizeMenu.kind === 'wstack') store.setWidgetStackLayout(sizeMenu.id, patch);
    else store.setGroupLayout(sizeMenu.id, patch);
  };

  /* 尺寸菜单可选项（第七十四轮，组件规范 2.2 声明机制）：A 型组件只列注册表 supportedSizes
   * 里出现过的宽度/高度，声明之外的尺寸不出现；编组/组合卡无声明概念，维持全开。
   * 现有 5 组件均声明四种形态全集，故当前菜单与此前逐项一致，机制为将来的收窄声明预留 */
  const sizeMenuColOptions: (1 | 2)[] =
    sizeMenu?.kind === 'widget'
      ? ([1, 2] as const).filter((n) => widgetDefOf(sizeMenu.id).supportedSizes.some((s) => s.colSpan === n))
      : [1, 2];
  const sizeMenuHeightOptions: (1 | 2)[] =
    sizeMenu?.kind === 'widget'
      ? ([1, 2] as const).filter((n) => widgetDefOf(sizeMenu.id).supportedSizes.some((s) => s.heightUnits === n))
      : [1, 2];

  /* ---------- 编组展开 / 弹窗 ---------- */
  const toggleExpand = (group: NavGroup) => {
    setExpandedId((prev) => (prev === group.id ? null : group.id));
  };

  /* ---------- 点卡外自动收起（第四十一轮） ----------
   * 展开是单卡模型（expandedId 同时只指一张）：document 捕获阶段监听 click，
   * 点击落在展开卡之外就收起。选捕获阶段的两个原因：
   * ① 站点行/瓷砖的 onClick 带 stopPropagation——冒泡监听收不到那次 click，
   *    「点其他卡站点 → 本卡收起、链接照常打开」会失效；捕获在目标处理前先到，不受影响。
   * ② 同一次 click 分发内目标在分发开始时已锁定：这里先收 A 引发的布局重排，
   *    不会让随后到达目标的 toggle/链接失效（pointerdown 判定则会因重排让 click 打偏，已实测）。
   * 两道拖拽守卫：整卡拖拽松手的 click 由 suppressClickRef 标记（拖拽收尾统一置位 250ms）；
   * 站点拖动等「从卡内按下」的手势由 pressInsideAt 记录按下点——本次手势的 click 一律不收，
   * 满足「起点在卡内、落点在卡外也不收」。只认左键 click（button 0），右键菜单不触发。
   * 不收的区域：展开卡内部、一切浮层（.fixed：GroupPanel/ComboPanel/任务面板/各类右键菜单等）、
   * 顶栏（.sticky：搜索下拉与背景/数据菜单的 absolute 面板都在顶栏 DOM 内）。
   * 点另一张 B 卡的「展开」：捕获先收 A，同次 click 到达按钮后 toggle（函数式更新）在
   * 已收起状态上打开 B，净效果 = 收 A 开 B（单卡模型不会双开）。 */
  const expandedIdRef = useRef<string | null>(null);
  expandedIdRef.current = expandedId;
  const pressInsideAtRef = useRef(0);
  useEffect(() => {
    if (!expandedId) return;
    const onDocPointerDown = (e: MouseEvent) => {
      const id = expandedIdRef.current;
      const wrap = id ? document.getElementById(`v2-group-${id}`) : null;
      pressInsideAtRef.current = wrap && e.target instanceof Node && wrap.contains(e.target) ? performance.now() : 0;
    };
    const onDocClickCapture = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const id = expandedIdRef.current;
      if (!id) return;
      const t = e.target as HTMLElement;
      if (!t || typeof t.closest !== 'function') return;
      const wrap = document.getElementById(`v2-group-${id}`);
      if (wrap && wrap.contains(t)) return;
      if (t.closest('.fixed, .sticky, [data-site-menu], [data-size-menu]')) return;
      if (suppressClickRef.current) return;
      if (pressInsideAtRef.current > 0 && performance.now() - pressInsideAtRef.current < 1200) return;
      setExpandedId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // 有弹窗/面板开着时 Esc 归它们自己处理，不抢
      if (panelGroupId || comboPanelId || showNewGroup) return;
      setExpandedId(null);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('click', onDocClickCapture, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('click', onDocClickCapture, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [expandedId, panelGroupId, comboPanelId, showNewGroup]);

  const scrollToGroup = (id: string) => {
    window.setTimeout(() => {
      document.getElementById(`v2-group-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const openGroupFromSearch = (group: NavGroup) => {
    if (group.display === 'list') {
      setExpandedId(group.id);
      scrollToGroup(group.id);
    } else {
      setPanelGroupId(group.id);
    }
  };

  const handleBecomeList = (group: NavGroup) => {
    // 该组若还在组合中（如从搜索打开单组弹窗切换形态），组合随之解散并把顺序修正为 [另一组, 该组]
    const combo = store.data.combos.find((c) => c.groupIds.includes(group.id));
    if (combo) store.detachComboMemberAsList(combo.id, group.id, baseOrderRef.current);
    setPanelGroupId(null);
    // 第一百一十二轮：切到 B 卡落收起态，不再自动展开（此前 setExpandedId 直接展开、顶开别的卡）
    scrollToGroup(group.id);
  };

  /** 组合弹窗内某组切成详细列表：脱离组合（另一组变回普通 C 卡留在组合位，该组排其后），关弹窗 */
  const handleComboBecomeList = (group: NavGroup) => {
    if (comboPanel) store.detachComboMemberAsList(comboPanel.id, group.id, baseOrderRef.current);
    setComboPanelId(null);
  };

  const renderGroup = (group: NavGroup, delay: number) =>
    group.display === 'list' ? (
      <GroupListCard
        group={group}
        expanded={expandedId === group.id}
        onToggleExpand={toggleExpand}
        store={store}
        colSpan={phoneViewport ? 1 : groupLayoutOf(groupLayouts, group.id).colSpan}
        heightUnits={groupLayoutOf(groupLayouts, group.id).heightUnits}
        delay={delay}
      />
    ) : (
      <GroupStackCard
        group={group}
        onOpen={(g) => setPanelGroupId(g.id)}
        delay={delay}
        colSpan={phoneViewport ? 1 : stackLayoutOf(groupLayouts, group.id).colSpan}
        heightUnits={stackLayoutOf(groupLayouts, group.id).heightUnits}
      />
    );

  /* ---------- 主页卡片顺序（拖拽排序后存本地） ---------- */
  // 默认顺序与此前硬编码的交错排版完全一致：B 组 → 任务 → C×1 → 资讯 → C×2 → 其余 C → 热门话题
  const defaultOrder = useMemo(() => {
    const order: string[] = listGroups.map((g) => groupCardKey(g.id));
    if (hasWidget('task')) order.push(widgetCardKey('task'));
    if (stackA) order.push(groupCardKey(stackA.id));
    if (hasWidget('news')) order.push(widgetCardKey('news'));
    if (stackB) order.push(groupCardKey(stackB.id));
    if (stackC) order.push(groupCardKey(stackC.id));
    for (const g of stackRest) order.push(groupCardKey(g.id));
    // 组合卡作为一个条目参与顺序（成员组不再单独出现）；已存顺序里组合的位置由 merge/split 动作维护
    for (const c of validCombos) order.push(comboCardKey(c.id));
    if (hasWidget('trending')) order.push(widgetCardKey('trending'));
    if (hasWidget('tools')) order.push(widgetCardKey('tools'));
    if (hasWidget('colors')) order.push(widgetCardKey('colors'));
    /* 组件摞（第七十二轮）：成员 key 全部摘掉，摞 key 落在成员中最靠前的位置。
     * 这只是 cardOrder 为空/对齐时的回落位——合并/拆分动作都会把摞的真实位置写进 cardOrder */
    let result = order;
    for (const s of validWidgetStacks) {
      const memberKeys = s.widgetIds.map((wid) => widgetCardKey(wid));
      const firstIdx = result.findIndex((k) => memberKeys.includes(k));
      const filtered = result.filter((k) => !memberKeys.includes(k));
      if (firstIdx < 0) filtered.push(widgetStackCardKey(s.id));
      else {
        const before = result.slice(0, firstIdx).filter((k) => !memberKeys.includes(k)).length;
        filtered.splice(before, 0, widgetStackCardKey(s.id));
      }
      result = filtered;
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listGroups, stackA, stackB, stackC, stackRest, widgets, validCombos, validWidgetStacks]);

  const baseOrder = useMemo(
    () => resolveCardOrder(store.data.cardOrder, defaultOrder),
    [store.data.cardOrder, defaultOrder],
  );
  const [previewOrder, setPreviewOrder] = useState<string[] | null>(null);
  const displayOrder = previewOrder ?? baseOrder;
  /** 拖拽中的预览锚点（存储空间，key → 栏）：普通拖拽只有被拖卡一项，
   *  tab 拖出时含被拖组与另一组（另一组 = 组合原来的栏）。state 供渲染、ref 供拖拽逻辑同步读 */
  const [previewCols, setPreviewCols] = useState<Record<string, number> | null>(null);
  const previewColsRef = useRef<Record<string, number> | null>(null);
  const setPreviewColsBoth = (v: Record<string, number> | null) => {
    previewColsRef.current = v;
    setPreviewCols(v);
  };

  const itemByKey = useMemo(() => {
    const map = new Map<
      string,
      { group?: NavGroup; widgetId?: WidgetId; combo?: ComboItem; widgetStack?: WidgetStackItem }
    >();
    for (const g of groups) map.set(groupCardKey(g.id), { group: g });
    for (const c of validCombos) map.set(comboCardKey(c.id), { combo: c });
    for (const w of WIDGET_DEFINITIONS) {
      if (widgets.includes(w.id) && !stackedMemberIds.has(w.id)) map.set(widgetCardKey(w.id), { widgetId: w.id });
    }
    for (const s of validWidgetStacks) map.set(widgetStackCardKey(s.id), { widgetStack: s });
    return map;
  }, [groups, widgets, validCombos, validWidgetStacks, stackedMemberIds]);

  /* ---------- 栏位布局（第三十四轮）：卡片占格只由（栏锚点 + 顺序 + 宽高）经 placeInLanes 算出，
     渲染时用显式 gridColumn/gridRow 钉死，不再让浏览器 dense 流自动收拢 ---------- */
  /** 卡片占位（存数据口径：右键布局的宽高，宽度渲染侧再夹一次；展开中的 B 卡不走这里） */
  const storedSpecOf = (key: string): { span: 1 | 2; height: number } => {
    const item = itemByKey.get(key);
    if (!item) return { span: 1, height: 1 };
    if (item.group) {
      const layout =
        item.group.display === 'list'
          ? groupLayoutOf(groupLayouts, item.group.id)
          : stackLayoutOf(groupLayouts, item.group.id);
      return { span: clampColSpan(layout.colSpan), height: layout.heightUnits };
    }
    if (item.combo) {
      const layout = stackLayoutOf(groupLayouts, comboCardKey(item.combo.id));
      return { span: clampColSpan(layout.colSpan), height: layout.heightUnits };
    }
    if (item.widgetStack) {
      const layout = stackLayoutOf(groupLayouts, widgetStackCardKey(item.widgetStack.id));
      return { span: clampColSpan(layout.colSpan), height: layout.heightUnits };
    }
    const layout = widgetLayouts[item.widgetId as WidgetId];
    return { span: clampColSpan(layout.colSpan), height: layout.heightUnits };
  };

  /** 渲染口径占位：展开中的 B 卡只把高度切到展开高（4 行）、宽度保持存储口径，其余同 storedSpecOf。
   * 第七十一轮修正：旧口径把展开卡强制改成 2 宽——锚在右栏的 1 宽卡被 placeInLanes 夹回
   * 左邻栏、行位又取两栏栈高的较大者，展开瞬间整卡左移并下沉（用户实测「展开后自己到了下面」）。
   * 宽度不动后，展开卡的（栏, 行）与收起态逐点一致：展开只长高，它之后同栏的卡顺移让位，
   * 收起后全部几何精确复原。展开体站点的排布列数由 GroupExpandedBody 按卡宽自适应，与此处无关。 */
  const renderSpecOf = (key: string): { span: 1 | 2; height: number } => {
    const item = itemByKey.get(key);
    if (item?.group?.display === 'list' && expandedId === item.group.id) {
      return { span: storedSpecOf(key).span, height: 4 };
    }
    /* 文件工具工作区打开时原地变高（第八十六轮建制，第一百零四轮改口径）：高度 =
     * 收起态的 2 倍（2x 口径，用户定版——旧「至少 3 行」在 1x 卡上会拉成近全屏高、
     * 下方大片空白）。与编组卡展开同理，宽度保持存储口径、只长高，同栏后续卡
     * 顺移让位、收起后精确复原。摞里的工作区组件只在它是当前成员时才撑高整摞。
     * 第一百零七轮：中式色卡工作区同制，一并走这张表 */
    const openWsWidgets: WidgetId[] = [
      ...(toolsWs.open ? (['tools'] as WidgetId[]) : []),
      ...(colorsWs.open ? (['colors'] as WidgetId[]) : []),
    ];
    if (openWsWidgets.length > 0) {
      const stored = storedSpecOf(key);
      for (const wid of openWsWidgets) {
        if (item?.widgetId === wid) return { span: stored.span, height: stored.height * 2 };
        if (
          item?.widgetStack &&
          item.widgetStack.activeWidgetId === wid &&
          item.widgetStack.widgetIds.includes(wid)
        ) {
          return { span: stored.span, height: stored.height * 2 };
        }
      }
    }
    return storedSpecOf(key);
  };

  /** 存量迁移（cardCols 为空时）：复刻旧瀑布流 dense 放置算出每张卡的栏与阅读序，一次性生成锚点 */
  const migration = useMemo(() => {
    if (Object.keys(store.data.cardCols).length > 0 || baseOrder.length === 0) return null;
    const keys = baseOrder.filter((k) => itemByKey.has(k));
    if (keys.length === 0) return null;
    const sim = simulateDenseFlow(
      keys.map((k) => ({ key: k, ...storedSpecOf(k) })),
      4,
    );
    const order = [...keys].sort((a, b) => {
      const pa = sim.get(a)!;
      const pb = sim.get(b)!;
      return pa.row - pb.row || pa.col - pb.col;
    });
    const cols: Record<string, number> = {};
    for (const k of keys) cols[k] = sim.get(k)!.col;
    return { order, cols };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.data.cardCols, baseOrder, itemByKey, groupLayouts, widgetLayouts]);

  /** 已存锚点的解析：缺失（新卡）由引擎回落最矮栏；锚点是用户选定的栏、与尺寸无关——
   * 右键改宽造成的跨度夹取只是当次放置的临时结果，落盘走 persistCols 保留原锚点，
   * 尺寸改回去位置精确复原（第一百零四轮修「1 栏→2 栏→1 栏位置漂移」） */
  const anchorResolution = useMemo(() => {
    const items = baseOrder
      .filter((k) => itemByKey.has(k))
      .map((k) => ({ key: k, ...storedSpecOf(k), anchor: store.data.cardCols[k] as number | undefined }));
    return placeInLanes(items, 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseOrder, itemByKey, groupLayouts, widgetLayouts, store.data.cardCols]);

  /** 当前生效的存储空间锚点（key → 栏）：迁移未落盘前先用迁移结果，否则用解析结果 */
  const effectiveCols = useMemo(() => {
    if (migration) return new Map<string, number>(Object.entries(migration.cols));
    return anchorResolution.resolvedCols;
  }, [migration, anchorResolution]);
  const effectiveColsRef = useRef(effectiveCols);
  effectiveColsRef.current = effectiveCols;

  // 迁移/回落锚点静默落盘：与已存值无差异则不写（store 侧另有等值短路，双保险防循环）
  useEffect(() => {
    if (migration) {
      store.applyCardMigration(migration.order, migration.cols);
      return;
    }
    const diff: Record<string, number> = {};
    anchorResolution.persistCols.forEach((col, key) => {
      if (store.data.cardCols[key] !== col) diff[key] = col;
    });
    if (Object.keys(diff).length > 0) store.ensureCardCols(diff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migration, anchorResolution, store.data.cardCols]);

  /* ---------- 小组件专属底色补抽（第二十三轮）：
     已显示的 A 型组件缺底色时随机抽一次（同屏尽量不重色），经 ensureWidgetTints 静默落盘；
     抽过即固定——刷新、跨设备同步后都以落盘值为准，不再重抽 ---------- */
  useEffect(() => {
    const tints = store.data.widgetTints;
    const used = new Set<number>();
    for (const id of store.data.widgets) {
      const v = tints[widgetCardKey(id)];
      if (typeof v === 'number') used.add(v);
    }
    const patch: Record<string, number> = {};
    for (const id of store.data.widgets) {
      const key = widgetCardKey(id);
      if (tints[key] === undefined) {
        const idx = pickWidgetTintIndex(used);
        used.add(idx);
        patch[key] = idx;
      }
    }
    if (Object.keys(patch).length > 0) store.ensureWidgetTints(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.data.widgets, store.data.widgetTints]);

  /* ---------- 手机单列高度估算（第六十六轮，呈现层专用、绝不落盘） ----------
   * 1X/2X 是桌面行高语义（158–176px/行），手机单列若照搬固定行高，内容少的卡必然留大片
   * 空白（用户实测的组合卡问题）。手机改按内容估算像素高，折算规则按卡型：
   * - C 卡/组合卡：卡件高（小角 13 + 卡身内边距 + 标题/双 tab 头 + 口线）+ 瓷砖区；
   *   瓷砖边长沿用第五十三轮同一公式（以卡身宽推导，手机全宽下 ≈60px，与桌面
   *   「1 栏 2X」基准一致，满足既有"图标统一尺寸"规则）；1x 只一行、2x 按站点数
   *   折行数全摆。组合卡头比普通 C 卡高（双 tab），单列全宽后每 tab 约 160px，
   *   组名（上限 8 字）完整显示（配合 ComboCard 的 compactTabs 去截断）。
   * - B 卡收起：手机按 1 列传参，可见行数 = 高度行数（1x 2 行 / 2x 4 行），按实测行高 52px 折算；
   *   展开态给 600px 定高，展开体内部自带滚动区（GroupExpandedBody）。
   * - 计划卡：1x 简洁卡面固定 172；2x 面板式按待办/计划条数估算并夹在 [320, 600]，
   *   超出部分由卡内滚动区承接（TaskCard 2x 内容区本就 overflow-y-auto）。
   * - 资讯/榜单：条数固定（资讯头条+4、榜单 6），2x 按内容全高、1x 与桌面同理只露一部分。
   * - 话题卡：固定 8 条，手机内部网格 2 列 4 行，按全高给 344（其内部 grid 为 flex-1，
   *   条数不足时行自动拉伸填满，不留白）。
   * - 文件工具卡：全宽走 1 栏排布，1x 横排瓷砖 2 行给 196、2x 放大瓷砖 3 行给 300。
   * 估算宁可略高几像素：各卡内容区多为 flex-1，多余高度被内容区吸收，不形成可见空白；
   * 略低则会被 overflow-hidden 截断内容，故统一带少量余量。 */
  const phoneHeights = useMemo(() => {
    if (!phoneViewport) return null;
    const map = new Map<string, number>();
    const cardW = viewportWidth - 24; // 内容列 px-3（<640 恒为 12×2）
    const bodyW = cardW - 34; // C 卡卡身：边框 2 + px-4 32
    const tile = Math.min(60.4, Math.max(20, (bodyW - 40) / 5));
    const perRow = Math.max(1, Math.floor((bodyW + 10.5) / (tile + 10)));
    const stackH = (n: number, hu: number): number => {
      if (hu === 1) return Math.round(116 + tile);
      if (n === 0) return 128;
      return Math.round(94 + Math.ceil(n / perRow) * (tile + 10));
    };
    const comboH = (n: number, hu: number): number => {
      if (hu === 1) return Math.round(108 + tile);
      if (n === 0) return 150;
      return Math.round(86 + Math.ceil(n / perRow) * (tile + 10));
    };
    /** 单个组件的手机估算高（按组件类型与高度档；组件摞按当前成员复用同一口径） */
    const widgetPhoneH = (id: WidgetId, lay: WidgetLayout): number => {
      switch (id) {
        case 'task':
          return lay.heightUnits === 2
            ? Math.min(600, Math.max(320, 250 + store.data.tasks.length * 40 + store.data.plans.length * 48))
            : 172;
        case 'news':
          return lay.heightUnits === 2 ? 336 : 172;
        case 'trending':
          return 344;
        case 'tools': {
          // 文件工具卡（第六十八轮）：手机全宽走 1 栏排布——1x 横排瓷砖 2 行、2x 放大瓷砖 3 行
          // 工作区打开时高度 = 收起态 2 倍（第一百零四轮 2x 口径，与桌面同制），
          // 溢出由工作区内部滚动承接，不再固定 600 拉成近全屏高
          const closed = lay.heightUnits === 2 ? 300 : 196;
          return toolsWs.open ? closed * 2 : closed;
        }
        case 'colors': {
          // 中式色卡（第一百零七轮）：手机 1 栏排布——1x 色带一排、2x 带当日一色块；
          // 工作区打开时高度 = 收起态 2 倍（与文件工具同制），色墙在工作区内滚动
          const closed = lay.heightUnits === 2 ? 300 : 196;
          return colorsWs.open ? closed * 2 : closed;
        }
        default:
          return 172;
      }
    };
    itemByKey.forEach((item, key) => {
      if (item.group) {
        const g = item.group;
        if (g.display === 'list') {
          if (expandedId === g.id) {
            map.set(key, 600);
            return;
          }
          const lay = groupLayoutOf(groupLayouts, g.id);
          const shown = Math.min(g.sites.length, lay.heightUnits === 2 ? 4 : 2);
          map.set(key, shown > 0 ? 68 + shown * 52 : 88);
          return;
        }
        const lay = stackLayoutOf(groupLayouts, g.id);
        map.set(key, stackH(g.sites.length, lay.heightUnits));
        return;
      }
      if (item.combo) {
        const lay = stackLayoutOf(groupLayouts, comboCardKey(item.combo.id));
        const active = groups.find((g) => g.id === item.combo!.activeGroupId) ?? groups.find((g) => g.id === item.combo!.groupIds[0]);
        map.set(key, comboH(active?.sites.length ?? 0, lay.heightUnits));
        return;
      }
      if (item.widgetStack) {
        // 组件摞（第七十二轮）：按当前成员的估算高 + 标题排一行（约 38px）
        const lay = stackLayoutOf(groupLayouts, widgetStackCardKey(item.widgetStack.id));
        map.set(key, widgetPhoneH(item.widgetStack.activeWidgetId, lay) + 38);
        return;
      }
      map.set(key, widgetPhoneH(item.widgetId as WidgetId, widgetLayouts[item.widgetId as WidgetId]));
    });
    map.set(TILE_ADD_KEY, 132);
    map.set(TILE_NEW_KEY, 132);
    return map;
  }, [phoneViewport, viewportWidth, itemByKey, groupLayouts, widgetLayouts, expandedId, groups, store.data.tasks, store.data.plans, toolsWs.open, colorsWs.open]);

  /** 渲染放置（视觉空间）：4 栏视口直接用存储锚点；2 栏视口两两合并（0,1→左、2,3→右，2 宽卡占满宽）。
   *  拖拽中相关卡的锚点先被 previewCols 覆盖。两个虚线入口块作为无锚点伪卡附在末尾（回落最矮栏）。 */
  const placements = useMemo(() => {
    /* 手机单列（第六十六轮）：同一套 lane 引擎按 1 栏跑——span 全 1、锚点全 0，
     * 只借它的确定性堆叠（顺序 = displayOrder，自上而下）；行高改由 phoneHeights
     * 逐卡给出像素值，经 rowTemplate 交给网格容器。存储锚点/宽高语义完全不参与。 */
    if (phoneViewport && phoneHeights) {
      const specs: LaneItemSpec[] = [];
      for (const key of displayOrder) {
        if (!itemByKey.has(key)) continue;
        specs.push({ key, span: 1, height: 1, anchor: 0 });
      }
      specs.push({ key: TILE_ADD_KEY, span: 1, height: 1, anchor: 0 });
      specs.push({ key: TILE_NEW_KEY, span: 1, height: 1, anchor: 0 });
      const result = placeInLanes(specs, 1);
      return {
        ...result,
        spanOf: new Map<string, number>(specs.map((s) => [s.key, 1])),
        heightOf: new Map<string, number>(specs.map((s) => [s.key, 1])),
        rowTemplate: specs.map((s) => `${phoneHeights.get(s.key) ?? 168}px`).join(' '),
      };
    }
    const specs: LaneItemSpec[] = [];
    for (const key of displayOrder) {
      if (!itemByKey.has(key)) continue;
      const spec = renderSpecOf(key);
      const stored = previewCols?.[key] ?? effectiveCols.get(key);
      let anchor: number | undefined;
      if (visualCols === 4) anchor = stored;
      else if (spec.span === 2) anchor = 0;
      else anchor = stored === undefined ? undefined : Math.floor(stored / 2);
      specs.push({ key, span: spec.span, height: spec.height, anchor });
    }
    specs.push({ key: TILE_ADD_KEY, span: 1, height: 1, anchor: undefined });
    specs.push({ key: TILE_NEW_KEY, span: 1, height: 1, anchor: undefined });
    const result = placeInLanes(specs, visualCols);
    return {
      ...result,
      spanOf: new Map(specs.map((s) => [s.key, s.span])),
      heightOf: new Map(specs.map((s) => [s.key, s.height])),
      rowTemplate: undefined as string | undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayOrder, itemByKey, groupLayouts, widgetLayouts, expandedId, visualCols, previewCols, effectiveCols, phoneViewport, phoneHeights, toolsWs.open, colorsWs.open]);
  const placementsRef = useRef(placements);
  placementsRef.current = placements;

  /** 虚线入口块的显式占格（与卡片同一套放置结果） */
  const tileStyle = (tileKey: string): React.CSSProperties => {
    const p = placements.pos.get(tileKey);
    return {
      gridColumn: `${(p?.col ?? 0) + 1} / span 1`,
      gridRow: `${(p?.row ?? 0) + 1} / span 1`,
    };
  };

  const renderCardItem = (key: string, index: number) => {
    const item = itemByKey.get(key);
    if (!item) return null;
    const delay = Math.min(0.02 + index * 0.04, 0.4);
    if (item.group) return renderGroup(item.group, delay);
    if (item.combo) {
      const ga = groups.find((g) => g.id === item.combo!.groupIds[0]);
      const gb = groups.find((g) => g.id === item.combo!.groupIds[1]);
      if (!ga || !gb) return null;
      const layout = stackLayoutOf(groupLayouts, comboCardKey(item.combo.id));
      return (
        <ComboCard
          combo={item.combo}
          groups={[ga, gb]}
          store={store}
          onOpen={(c) => setComboPanelId(c.id)}
          delay={delay}
          colSpan={phoneViewport ? 1 : layout.colSpan}
          heightUnits={layout.heightUnits}
          compactTabs={phoneViewport}
        />
      );
    }
    if (item.widgetStack) {
      // 组件摞（第七十二轮）：整摞一张卡，尺寸/底色/成员渲染都在 WidgetStackCard 内收口
      const layout = stackLayoutOf(groupLayouts, widgetStackCardKey(item.widgetStack.id));
      return (
        <WidgetStackCard
          stack={item.widgetStack}
          store={store}
          onNavigate={onNavigate}
          layout={layout}
          delay={delay}
          phone={phoneViewport}
        />
      );
    }
    /* A 型组件渲染（第七十四轮起走统一注册表）：按 id 查注册定义渲染其适配组件，
     * 统一 props 的映射与原 switch 逐项一致（尺寸感知组件吃布局、手机单列宽按 1 栏） */
    const def = widgetDefOf(item.widgetId);
    const WidgetComp = def.component;
    return (
      <WidgetComp
        store={store}
        onNavigate={onNavigate}
        tint={widgetTintOf(store.data.widgetTints, widgetCardKey(def.id))}
        layout={widgetLayouts[def.id]}
        delay={delay}
        phone={phoneViewport}
      />
    );
  };

  /* ---------- 拖拽排序 ----------
   * 指针按下后移动超过阈值才判定为拖拽：普通点击（开站点 / B 卡展开 / C 卡弹窗 / 右键菜单）完全不受影响；
   * 拖拽中被拖卡片变为虚线占位、浮动快照跟随指针，其余卡片按预览顺序实时让位，松手才落盘。
   * 表单控件与 data-nodrag 区域（B 卡展开的滚动列表）内按下不触发拖拽。 */
  const DRAG_THRESHOLD = 8;
  const wrapperRefs = useRef(new Map<string, HTMLDivElement>());
  const pendingDragRef = useRef<{
    key: string;
    pointerId: number;
    startX: number;
    startY: number;
    /** 从组合卡 tab 头按下时记下：这是一次「把该组拖出组合」的拖拽（第二十一轮修订） */
    tab?: { comboId: string; groupId: string };
  } | null>(null);
  const activeDragRef = useRef<{
    key: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    scrollEl: HTMLElement | null;
    /** 抓起时被拖卡的像素高度与视觉宽度（栏数）：落点判定按拖影中心/左缘对栏与插入位 */
    rectH: number;
    spanV: number;
    tabExtract?: { comboId: string; groupId: string };
    /** 拖拽激活瞬间各卡的矩形快照（合并目标兜底判定用：按压开始时指针所指的卡） */
    startRects?: Map<string, DOMRect>;
  } | null>(null);
  const previewOrderRef = useRef<string[] | null>(null);
  /** 拖拽合并充能（第二十一轮修订，第三十七轮改 2 秒）：拖动满 2 秒点亮「可合并文件夹」；chargeTimer 推进度 */
  const chargeRef = useRef<{ startAt: number; ready: boolean } | null>(null);
  const chargeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 充能完成后指针压住的合并目标卡 key（松手即合并） */
  const mergeTargetRef = useRef<string | null>(null);
  /** 组件合并的悬停提示现状（第七十二轮）：key + 是否已满；与 mergeTargetRef 分开——已满只给反馈、不落合并 */
  const widgetHintRef = useRef<{ key: string; full: boolean } | null>(null);
  const baseOrderRef = useRef<string[]>(baseOrder);
  baseOrderRef.current = baseOrder;
  const storeRef = useRef(store);
  storeRef.current = store;
  const suppressClickRef = useRef(false);
  const cloneRef = useRef<HTMLDivElement>(null);
  const autoScrollRafRef = useRef(0);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragSnap, setDragSnap] = useState<{ html: string; w: number; h: number } | null>(null);

  useEffect(() => {
    const positionClone = (x: number, y: number) => {
      const d = activeDragRef.current;
      if (d && cloneRef.current) {
        cloneRef.current.style.transform = `translate(${x - d.offsetX}px, ${y - d.offsetY}px)`;
      }
    };

    /* 落点判定（第三十四轮，栏位模型）：目标栏由拖影左缘在网格分栏中的位置决定，
     * 插入位由拖影纵向中心与目标栏（被拖卡横向范围所跨的栏）内各卡中心的比较决定。
     * 只改被拖卡的预览锚点与顺序——占位只出现在目标栏内，其他栏的卡锚点纹丝不动。 */
    const updatePreviewTarget = (x: number, y: number) => {
      const d = activeDragRef.current;
      const order = previewOrderRef.current;
      const grid = gridRef.current;
      if (!d || !order || !grid) return;
      const cols = visualColsRef.current;
      const grect = grid.getBoundingClientRect();
      const gap = parseFloat(window.getComputedStyle(grid).columnGap) || 12;
      const colW = (grect.width - gap * (cols - 1)) / cols;
      const span = d.spanV;
      let vCol = Math.floor((x - d.offsetX - grect.left) / (colW + gap));
      vCol = Math.max(0, Math.min(cols - span, vCol));
      // 视觉栏 → 存储锚点：4 栏即本身；2 栏时 1 宽卡按「对子内偏移」（旧锚点 %2）还原，2 宽卡夹到合法范围
      const prevCols = previewColsRef.current ?? {};
      const oldStored = prevCols[d.key] ?? effectiveColsRef.current.get(d.key) ?? 0;
      let sCol: number;
      if (cols === 4) sCol = vCol;
      else if (cols === 1) sCol = oldStored; // 手机单列（第六十六轮）：锚点无意义，保持原值只落顺序
      else if (span === 2) sCol = Math.min(oldStored, 2);
      else sCol = Math.max(0, Math.min(3, vCol * 2 + (oldStored % 2)));
      if (prevCols[d.key] !== sCol) {
        setPreviewColsBoth({ ...prevCols, [d.key]: sCol });
      }
      // 插入位：与被拖卡横向范围相交的卡中，第一张纵向中心在拖影中心之下的卡之前；都没有则排在同栏最后一张之后
      const centerY = y - d.offsetY + d.rectH / 2;
      let refKey: string | null = null;
      let lastCand: string | null = null;
      for (const k of order) {
        if (k === d.key) continue;
        const p = placementsRef.current.pos.get(k);
        const ks = placementsRef.current.spanOf.get(k) ?? 1;
        if (!p) continue;
        if (p.col + ks - 1 < vCol || p.col > vCol + span - 1) continue;
        lastCand = k;
        const el = wrapperRefs.current.get(k);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (centerY < r.top + r.height / 2) {
          refKey = k;
          break;
        }
      }
      const next = order.filter((k) => k !== d.key);
      let to: number;
      if (refKey) to = next.indexOf(refKey);
      else if (lastCand) to = next.indexOf(lastCand) + 1;
      else to = next.length;
      next.splice(Math.max(0, to), 0, d.key);
      if (next.join('|') !== order.join('|')) {
        previewOrderRef.current = next;
        setPreviewOrder(next);
      }
    };

    /* ---------- 拖拽合并（第二十一轮，含手势修订） ----------
     * 合并：拖动一张可合并的 stack 卡（不在组合中）持续满 2 秒（第三十七轮由 3 秒改短）→ 充能完成进入「可合并」状态，
     * 拖影上有充能进度提示（条 + 文案，满 2 秒点亮「可合并文件夹」）；此后拖影压到任意其他可合并
     * stack 卡上立即在目标卡显示合并提示，松手即合并；压到不可合并目标/空白松手 = 普通排序。
     * 未满 2 秒松手全程只是普通排序。充能靠真实时间：指针静止时没有 pointermove，
     * 用 60ms 定时器推进度，并在点亮瞬间复核悬停目标（指针可能早已压在目标上）。 */
    const CHARGE_MS = 2000;
    const groupIdFromKey = (key: string) => (key.startsWith('group:') ? key.slice('group:'.length) : null);

    const clearCharge = () => {
      if (chargeTimerRef.current) {
        clearInterval(chargeTimerRef.current);
        chargeTimerRef.current = null;
      }
      chargeRef.current = null;
      mergeTargetRef.current = null;
      widgetHintRef.current = null;
      setChargeUi(null);
      setMergeUi(null);
    };

    /** 某组当前可否作为合并参与方：stack 型且不在任何组合中 */
    const mergeableGroup = (gid: string | null) => {
      if (!gid) return null;
      const data = storeRef.current.data;
      const g = data.groups.find((gr) => gr.id === gid);
      if (!g || g.display !== 'stack') return null;
      if (data.combos.some((c) => c.groupIds.includes(gid))) return null;
      return g;
    };

    /* ---------- 组件摞合并判定（第七十二轮，与编组合并并行的一套） ----------
     * 手势与编组完全同构：拖动满 2 秒充能点亮，此后压住目标松手即合并，未点亮前全程只是排序；
     * 这样拖拽排序必然要「路过」其他卡也不会误合，缝隙/卡身的区分由充能意图承担。 */
    const widgetIdFromKey = (key: string): WidgetId | null =>
      key.startsWith('widget:') ? (key.slice('widget:'.length) as WidgetId) : null;
    const widgetStackIdFromKey = (key: string): string | null =>
      key.startsWith('wstack:') ? key.slice('wstack:'.length) : null;

    /** 卡 key → 组件合并参与方：未入摞的单个组件 / 一整摞；入摞成员没有独立卡面，不是参与方 */
    const widgetEntityOfKey = (key: string): WidgetMergeEntity | null => {
      const data = storeRef.current.data;
      const wid = widgetIdFromKey(key);
      if (wid) {
        if (!data.widgets.includes(wid)) return null;
        if (data.widgetStacks.some((s) => s.widgetIds.includes(wid))) return null;
        return { type: 'widget', id: wid };
      }
      const sid = widgetStackIdFromKey(key);
      if (sid && data.widgetStacks.some((s) => s.id === sid)) return { type: 'stack', id: sid };
      return null;
    };
    const widgetEntitySize = (e: WidgetMergeEntity): number =>
      e.type === 'widget'
        ? 1
        : (storeRef.current.data.widgetStacks.find((s) => s.id === e.id)?.widgetIds.length ?? 0);
    /** 两组件实体可否合并：ok = 可并；full = 目标合法但并完超上限 4；null = 不是可合并目标 */
    const widgetMergeVerdict = (dragKey: string, targetKey: string): 'ok' | 'full' | null => {
      if (dragKey === targetKey) return null;
      const drag = widgetEntityOfKey(dragKey);
      const target = widgetEntityOfKey(targetKey);
      if (!drag || !target) return null;
      return widgetEntitySize(drag) + widgetEntitySize(target) > WIDGET_STACK_MAX ? 'full' : 'ok';
    };

    /** 充能完成后复核指针压住的合并目标（无目标/不可合并时清掉提示） */
    const updateMergeTarget = (x: number, y: number) => {
      const d = activeDragRef.current;
      if (!d || !chargeRef.current?.ready || !mergeableGroup(groupIdFromKey(d.key))) {
        if (mergeTargetRef.current) {
          mergeTargetRef.current = null;
          setMergeUi(null);
        }
        return;
      }
      const found: { key: string | null } = { key: null };
      wrapperRefs.current.forEach((el, key) => {
        if (found.key || key === d.key) return;
        if (!mergeableGroup(groupIdFromKey(key))) return;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found.key = key;
      });
      if (!found.key && d.startRects) {
        // 兜底：拖拽预览重排会把目标卡挤走、占位槽盖住指针——指针当前不在任何可合并卡的
        // 现矩形内，但若它正压在某张可合并卡「拖拽开始时」的位置上，那张卡就是用户瞄准的
        // 目标（开始时的槽位互不重叠，不会多义）。充能完成本身即明确的合并意图信号，
        // 此兜底只在 ready 态走 updateMergeTarget 时生效。
        d.startRects.forEach((r, key) => {
          if (found.key || key === d.key) return;
          if (!mergeableGroup(groupIdFromKey(key))) return;
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) found.key = key;
        });
      }
      if (found.key !== mergeTargetRef.current) {
        mergeTargetRef.current = found.key;
        setMergeUi(found.key ? { targetKey: found.key, progress: 1, ready: true, kind: 'group' } : null);
      }
    };

    /** 组件合并目标复核（第七十二轮，机理同编组版：现矩形优先、拖拽开始时矩形兜底）：
     * 并完超上限的摞也算命中但标 full——只给红色拒绝反馈，mergeTargetRef 不落它，松手只排序 */
    const updateWidgetMergeTarget = (x: number, y: number) => {
      const d = activeDragRef.current;
      if (!d || !chargeRef.current?.ready || !widgetEntityOfKey(d.key)) {
        if (widgetHintRef.current) {
          widgetHintRef.current = null;
          mergeTargetRef.current = null;
          setMergeUi(null);
        }
        return;
      }
      let hit: { key: string; full: boolean } | null = null;
      wrapperRefs.current.forEach((el, key) => {
        if (hit || key === d.key) return;
        const verdict = widgetMergeVerdict(d.key, key);
        if (!verdict) return;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = { key, full: verdict === 'full' };
      });
      if (!hit && d.startRects) {
        d.startRects.forEach((r, key) => {
          if (hit || key === d.key) return;
          const verdict = widgetMergeVerdict(d.key, key);
          if (!verdict) return;
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) hit = { key, full: verdict === 'full' };
        });
      }
      const prev = widgetHintRef.current;
      if (hit?.key !== prev?.key || hit?.full !== prev?.full) {
        widgetHintRef.current = hit;
        mergeTargetRef.current = hit && !hit.full ? hit.key : null;
        setMergeUi(
          hit ? { targetKey: hit.key, progress: 1, ready: true, kind: 'widget', full: hit.full } : null,
        );
      }
    };

    /** 合并目标复核分发：被拖卡是哪套体系走哪套判定（编组与组件互不干扰） */
    const updateAnyMergeTarget = (x: number, y: number) => {
      const d = activeDragRef.current;
      if (!d) return;
      if (widgetEntityOfKey(d.key)) updateWidgetMergeTarget(x, y);
      else updateMergeTarget(x, y);
    };

    /** 拖拽激活时若被拖卡可合并则开始充能计时（编组 stack 卡与小组件/组件摞共用，kind 决定提示文案） */
    const startChargeIfEligible = (dragKey: string) => {
      const kind: 'group' | 'widget' | null = mergeableGroup(groupIdFromKey(dragKey))
        ? 'group'
        : widgetEntityOfKey(dragKey)
          ? 'widget'
          : null;
      if (!kind) return;
      chargeRef.current = { startAt: Date.now(), ready: false };
      setChargeUi({ progress: 0, ready: false, kind });
      chargeTimerRef.current = setInterval(() => {
        const c = chargeRef.current;
        const d = activeDragRef.current;
        if (!c || !d) {
          clearCharge();
          return;
        }
        const progress = Math.min(1, (Date.now() - c.startAt) / CHARGE_MS);
        if (progress >= 1) {
          if (!c.ready) {
            c.ready = true;
            setChargeUi({ progress: 1, ready: true, kind });
          }
          // 点亮后不停止计时器：持续复核指针压住的合并目标——拖拽预览重排会让卡片在
          // 静止指针下方滑动，单靠 pointermove/点亮瞬间的一次复核会漏判（压着目标却没提示）；
          // 每 60ms 按当前布局复核一次，目标变化时才更新 UI，无额外渲染负担
          updateAnyMergeTarget(d.lastX, d.lastY);
          return;
        }
        setChargeUi({ progress, ready: false, kind });
      }, 60);
    };

    const stopAutoScroll = () => cancelAnimationFrame(autoScrollRafRef.current);
    const startAutoScroll = () => {
      const step = () => {
        const d = activeDragRef.current;
        if (!d) return;
        const el = d.scrollEl;
        if (el) {
          const r = el.getBoundingClientRect();
          const EDGE = 72;
          const SPEED = 14;
          if (d.lastY < r.top + EDGE && el.scrollTop > 0) {
            el.scrollBy(0, -SPEED);
            updatePreviewTarget(d.lastX, d.lastY);
          } else if (d.lastY > r.bottom - EDGE && el.scrollTop + el.clientHeight < el.scrollHeight) {
            el.scrollBy(0, SPEED);
            updatePreviewTarget(d.lastX, d.lastY);
          }
        }
        autoScrollRafRef.current = requestAnimationFrame(step);
      };
      autoScrollRafRef.current = requestAnimationFrame(step);
    };

    const endDrag = (commit: boolean) => {
      if (!activeDragRef.current) return;
      const dragKeyNow = activeDragRef.current.key;
      const tabExtract = activeDragRef.current.tabExtract;
      const chargeReady = !!chargeRef.current?.ready;
      // 落手瞬间按最终指针位置与当前布局再复核一次合并目标（预览重排后目标可能刚滑入/滑出指针下方）
      if (commit && chargeReady) {
        updateAnyMergeTarget(activeDragRef.current.lastX, activeDragRef.current.lastY);
      }
      const mergeTarget = mergeTargetRef.current;
      clearCharge();
      setTabSnap(null);
      activeDragRef.current = null;
      pendingDragRef.current = null;
      stopAutoScroll();
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const finalOrder = previewOrderRef.current;
      previewOrderRef.current = null;
      const finalCols = previewColsRef.current;
      setPreviewColsBoth(null);
      setPreviewOrder(null);
      setDragKey(null);
      setDragSnap(null);
      let handled = false;
      if (commit && !tabExtract && chargeReady && mergeTarget) {
        // 充能完成且压着合并目标松手：执行合并而不是排序落盘（基于当前已存顺序计算落点）
        const dragEnt = widgetEntityOfKey(dragKeyNow);
        const targetEnt = widgetEntityOfKey(mergeTarget);
        if (dragEnt && targetEnt) {
          storeRef.current.mergeWidgetEntities(dragEnt, targetEnt, baseOrderRef.current);
          handled = true;
        } else {
          const dragGid = groupIdFromKey(dragKeyNow);
          const targetGid = groupIdFromKey(mergeTarget);
          if (dragGid && targetGid) {
            storeRef.current.mergeCombo(dragGid, targetGid, baseOrderRef.current);
            handled = true;
          }
        }
      }
      if (!handled && commit && tabExtract && finalOrder) {
        // tab 拖出落定：组合解散，被拖组按预览落点成独立卡（取消拖拽则不落盘、组合原样）；
        // 两组锚点按预览给出的最终栏位一并落盘（被拖组 = 落点栏，另一组 = 组合原来的栏）
        storeRef.current.extractComboGroup(tabExtract.comboId, tabExtract.groupId, finalOrder, finalCols ?? {});
        handled = true;
      }
      if (!handled && commit && finalOrder) {
        // 普通拖拽落盘（第三十四轮）：顺序 + 被拖卡锚点一次写入；两者都没变则不写
        const orderChanged = finalOrder.join('|') !== baseOrderRef.current.join('|');
        const colsChanged = finalCols
          ? Object.entries(finalCols).some(([k, v]) => storeRef.current.data.cardCols[k] !== v)
          : false;
        if (orderChanged || colsChanged) {
          storeRef.current.setCardPlacement(finalOrder, finalCols ?? {});
        }
      }
      // 拖拽松手后的那次 click 可能落在站点按钮上，吞掉避免误开站点 / 误触展开
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 250);
    };

    const onPointerMove = (e: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (!activeDragRef.current && pending && e.pointerId === pending.pointerId) {
        if (Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < DRAG_THRESHOLD) return;
        const el = wrapperRefs.current.get(pending.key);
        if (!el) {
          pendingDragRef.current = null;
          return;
        }
        const rect = el.getBoundingClientRect();
        const tab = pending.tab;
        pendingDragRef.current = null;
        clearCharge();
        let dragEntityKey = pending.key;
        const order = [...baseOrderRef.current];
        // 预览锚点初值（第三十四轮）：普通拖拽 = 被拖卡当前生效锚点；
        // tab 拖出时被拖组与另一组都先落在组合原来的栏，拖动中再由指针改被拖组的锚点
        let initialCols: Record<string, number> = {
          [dragEntityKey]: effectiveColsRef.current.get(dragEntityKey) ?? 0,
        };
        if (tab) {
          // tab 拖出：预览顺序里把组合条目拆成 [另一组, 被拖组]，此后与普通卡拖拽同路；
          // 拖影不用组合卡的 HTML，改由屏外渲染的该组普通 C 卡提供（见 tabSnap 渲染与布局副作用）
          dragEntityKey = groupCardKey(tab.groupId);
          const combo = storeRef.current.data.combos.find((c) => c.id === tab.comboId);
          const otherId = combo?.groupIds.find((id) => id !== tab.groupId);
          if (combo && otherId) {
            const pair = [groupCardKey(otherId), dragEntityKey];
            const ci = order.indexOf(comboCardKey(combo.id));
            if (ci >= 0) order.splice(ci, 1, ...pair);
            else order.push(...pair);
            const comboCol = effectiveColsRef.current.get(comboCardKey(combo.id)) ?? 0;
            initialCols = { [groupCardKey(otherId)]: comboCol, [dragEntityKey]: comboCol };
          }
        }
        setPreviewColsBoth(initialCols);
        activeDragRef.current = {
          key: dragEntityKey,
          pointerId: pending.pointerId,
          offsetX: pending.startX - rect.left,
          offsetY: pending.startY - rect.top,
          lastX: e.clientX,
          lastY: e.clientY,
          scrollEl: findScrollAncestor(el),
          rectH: rect.height,
          spanV: placementsRef.current.spanOf.get(pending.key) ?? 1,
          tabExtract: tab,
        };
        if (!tab) {
          // 拖拽开始瞬间的卡片矩形快照（此时预览尚未重排）：合并目标兜底判定按「开始时指针所指的卡」
          const rects = new Map<string, DOMRect>();
          wrapperRefs.current.forEach((el2, key) => rects.set(key, el2.getBoundingClientRect()));
          activeDragRef.current.startRects = rects;
        }
        previewOrderRef.current = order;
        setPreviewOrder(order);
        setDragKey(dragEntityKey);
        if (tab) {
          const data = storeRef.current.data;
          const g = data.groups.find((gr) => gr.id === tab.groupId);
          const comboLayout = stackLayoutOf(data.groupLayouts, comboCardKey(tab.comboId));
          if (g) {
            setTabSnap({ group: g, w: rect.width, h: rect.height, colSpan: comboLayout.colSpan, heightUnits: comboLayout.heightUnits });
          }
        } else {
          setDragSnap({ html: el.innerHTML, w: rect.width, h: rect.height });
          startChargeIfEligible(dragEntityKey);
        }
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        startAutoScroll();
      }
      const d = activeDragRef.current;
      if (d && e.pointerId === d.pointerId) {
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        positionClone(e.clientX, e.clientY);
        updatePreviewTarget(e.clientX, e.clientY);
        updateAnyMergeTarget(e.clientX, e.clientY);
      }
    };

    /** 第二指落下（双指缩放开始）：取消卡片拖拽的待命/进行中拖动（不落盘），缩放优先（第七十三轮）。
     * 同一指自己的 pointerdown 先经 React 处理器登记（id 相同，不受影响）。 */
    const onSecondPointerDown = (e: PointerEvent) => {
      if (pendingDragRef.current && e.pointerId !== pendingDragRef.current.pointerId) pendingDragRef.current = null;
      if (activeDragRef.current && e.pointerId !== activeDragRef.current.pointerId) endDrag(false);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pendingDragRef.current && e.pointerId === pendingDragRef.current.pointerId) pendingDragRef.current = null;
      if (activeDragRef.current && e.pointerId === activeDragRef.current.pointerId) endDrag(true);
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (pendingDragRef.current && e.pointerId === pendingDragRef.current.pointerId) pendingDragRef.current = null;
      if (activeDragRef.current && e.pointerId === activeDragRef.current.pointerId) endDrag(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeDragRef.current) endDrag(false);
    };

    window.addEventListener('pointerdown', onSecondPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onSecondPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      stopAutoScroll();
      if (chargeTimerRef.current) {
        clearInterval(chargeTimerRef.current);
        chargeTimerRef.current = null;
      }
    };
  }, []);

  // 浮动快照一挂载就先定位到抓起的位置，避免首帧闪到角落
  useLayoutEffect(() => {
    const d = activeDragRef.current;
    if (dragSnap && d && cloneRef.current) {
      cloneRef.current.style.transform = `translate(${d.lastX - d.offsetX}px, ${d.lastY - d.offsetY}px)`;
    }
  }, [dragSnap]);

  // tab 拖出：屏外渲染的该组普通 C 卡就绪后，把其 HTML 设为拖拽快照（拖影即该组卡面）
  useLayoutEffect(() => {
    if (tabSnap && tabSnapRef.current) {
      setDragSnap({ html: tabSnapRef.current.innerHTML, w: tabSnap.w, h: tabSnap.h });
    }
  }, [tabSnap]);

  const handleCardPointerDown = (e: React.PointerEvent, key: string) => {
    if (e.button !== 0 || activeDragRef.current || pendingDragRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"], [data-nodrag]')) return;
    suppressClickRef.current = false;
    // 组合卡 tab 头按下：记为「把该组拖出组合」的候选拖拽（超过阈值才激活，普通点击仍是切 tab）
    const tabEl = target.closest<HTMLElement>('[data-combo-tab-drag]');
    if (tabEl?.dataset.comboId && tabEl?.dataset.groupId) {
      pendingDragRef.current = {
        key,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        tab: { comboId: tabEl.dataset.comboId, groupId: tabEl.dataset.groupId },
      };
      return;
    }
    pendingDragRef.current = { key, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
  };

  const handleGridClickCapture = (e: React.SyntheticEvent) => {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    }
  };

  const createGroup = () => {
    // 组名上限 8 字（第三十二轮）：输入框 maxLength 之外再按码点截断兜底
    const name = clampGroupName(newGroupName.trim());
    if (!name) return;
    const id = store.addGroup(name, newGroupDisplay);
    setNewGroupName('');
    setShowNewGroup(false);
    if (newGroupDisplay === 'list') {
      setExpandedId(id);
      scrollToGroup(id);
    } else {
      // 文件夹式：直接打开弹窗，方便立刻往里加网站
      window.setTimeout(() => setPanelGroupId(id), 60);
    }
  };

  const dashedTileCls =
    'w-full h-full rounded-[26px] border border-dashed border-white/15 text-white/45 hover:text-white/85 hover:border-white/35 transition-colors flex flex-col items-center justify-center gap-1.5 text-xs';

  return (
    <div className="flex flex-col" onContextMenu={handleBlankContextMenu}>
      {/* 吸顶栏（一行对齐）：与下方卡片网格同款 4 栏 grid——左半 2 栏放页面导航图标组（靠左），
          右半 2 栏放搜索框 +「数据」入口（算在右半内）；整条栏吸顶，滚动时停留在视口顶部。
          移动端为 2 栏 grid，左右各半，仍保持一行不换行。 */}
      {/* 吸顶栏底已按用户要求全透明：各控件自带实色底，直接浮在页面背景之上 */}
      <div className="sticky top-0 z-50 -mt-1 pt-1 pb-2">
        {/* 遮挡带（第五十九轮）第六十三轮起改由 App 在容器层统一渲染（fixed 全幅），不在栏内挂 */}
        {/* 移动端列宽（第六十四轮实测修正）：左组加 LOGO 后内容约 207px，grid-cols-2 的半屏
            （390px 时 177px）装不下、工具钮会被搜索框盖住一半无法点。移动端改左列按内容宽、
            右列吃剩余（搜索框可缩），lg 起仍是原 4 栏等分、左组位置与桌面完全一致 */}
        <div className="grid grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-4 gap-3 sm:gap-4 items-center">
          <div className="col-span-1 lg:col-span-2 flex items-center justify-start gap-2 min-w-0">
            <TopLogo onClick={() => onNavigate('home')} />
            <TopNav onPageChange={onNavigate} currentPage="home" presetsNode={<PresetMenu store={store} />} />
          </div>
          <div className="col-span-1 lg:col-span-2 flex items-center gap-2 min-w-0">
            <StickySearch groups={groups} onOpenGroup={openGroupFromSearch} />
            <PwaInstallButton />
            <DataMenu store={store} />
          </div>
        </div>
      </div>

      {/* 栏位网格（第三十四轮）：4 栏（平板 2 栏 / 手机 1 栏单列，第六十六轮），每张卡的占格由 placements 显式给出
          （gridColumn/gridRow 钉死），不走自动流——栏与栏互不挤占，空栏留空。
          手机单列时行高由 placements.rowTemplate 逐卡按内容估算（见 phoneHeights），不用固定 auto-rows。
          顶部留白约 28–32px 级别（移动端略小），让第一行卡片与吸顶导航条明显隔开、有呼吸感 */}
      <div
        ref={gridRef}
        className={`grid gap-3 sm:gap-4 mt-6 sm:mt-7 lg:mt-8 ${
          phoneViewport
            ? 'grid-cols-1'
            : 'grid-cols-2 lg:grid-cols-4 auto-rows-[158px] sm:auto-rows-[168px] lg:auto-rows-[176px]'
        }`}
        style={placements.rowTemplate ? { gridTemplateRows: placements.rowTemplate } : undefined}
        onClickCapture={handleGridClickCapture}
        onDragStart={(e) => e.preventDefault()}
      >
        {displayOrder.map((key, i) => {
          const item = itemByKey.get(key);
          if (!item) return null;
          const wid = item.widgetId;
          const pos = placements.pos.get(key);
          const span = placements.spanOf.get(key) ?? 1;
          const heightUnits = placements.heightOf.get(key) ?? 1;
          return (
            <div
              key={key}
              id={
                item.group
                  ? `v2-group-${item.group.id}`
                  : item.widgetId === 'tools' || item.widgetStack?.widgetIds.includes('tools')
                    ? // 扳手定位锚点（第八十六轮）：文件工具在主页上至多出现一处（单卡或摞内）
                      'v2-widget-tools'
                    : undefined
              }
              ref={(el) => {
                if (el) wrapperRefs.current.set(key, el);
                else wrapperRefs.current.delete(key);
              }}
              data-card-key={key}
              className="scroll-mt-20 relative"
              style={{
                gridColumn: `${(pos?.col ?? 0) + 1} / span ${span}`,
                gridRow: `${(pos?.row ?? 0) + 1} / span ${heightUnits}`,
                // pan-y：单指纵向归浏览器滚动、横向留给指针拖拽；pinch-zoom（第七十三轮补）：
                // 只写 pan-y 时双指手势不归浏览器处理、在卡片上起手缩不了，必须显式放行
                touchAction: 'pan-y pinch-zoom',
              }}
              onPointerDown={(e) => handleCardPointerDown(e, key)}
              onContextMenu={
                item.group
                  ? (e) => openSizeMenu(e, { kind: 'group', id: item.group!.id })
                  : item.combo
                    ? (e) => openSizeMenu(e, { kind: 'combo', id: item.combo!.id })
                    : item.widgetStack
                      ? (e) => openSizeMenu(e, { kind: 'wstack', id: item.widgetStack!.id })
                      : wid
                        ? (e) => openSizeMenu(e, { kind: 'widget', id: wid })
                        : undefined
              }
            >
              <div className={dragKey === key ? 'h-full invisible' : 'h-full'}>{renderCardItem(key, i)}</div>
              {dragKey === key && (
                <div className="absolute inset-0 z-10 rounded-[26px] border-2 border-dashed border-indigo-400/60 bg-indigo-500/10 pointer-events-none" />
              )}
              {/* 合并提示（第二十一轮修订）：充能完成后拖影压住的目标卡——描边高亮 + 「松开合并」，出现即松手合并；
                  组件摞已满时为红色拒绝态（第七十二轮）：只反馈、不落合并，松手按普通排序处理 */}
              {dragKey && mergeUi && mergeUi.targetKey === key && (
                <div
                  data-merge-hint={mergeUi.full ? 'full' : 'ready'}
                  className={`absolute inset-0 z-20 rounded-[26px] border-2 pointer-events-none flex flex-col items-center justify-end overflow-hidden ${
                    mergeUi.full ? 'border-red-400 bg-red-500/15' : 'border-indigo-400 bg-indigo-500/15'
                  }`}
                >
                  <div className="m-2 w-[calc(100%-16px)] rounded-xl bg-[#17171d]/95 border border-white/15 px-3 py-2">
                    <p className="text-[11px] font-medium text-white/85 text-center">
                      {mergeUi.full
                        ? `已满（最多 ${WIDGET_STACK_MAX} 个），松开取消合并`
                        : mergeUi.kind === 'widget'
                          ? '松开合并组件'
                          : '松开合并文件夹'}
                    </p>
                    <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div
                        data-merge-progress
                        className={`h-full ${mergeUi.full ? 'bg-red-400' : 'bg-indigo-400'}`}
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* 添加组件入口（占格同样由 placements 决定：附在最矮栏末尾）；
            第七十四轮起升级为跳组件商店页（原主页组件开关面板已由商店取代） */}
        <div style={tileStyle(TILE_ADD_KEY)}>
          <button data-add-widget-tile onClick={() => onNavigate('store')} className={dashedTileCls}>
            <LayoutGrid size={18} />
            添加组件
          </button>
        </div>

        {/* 新建编组入口 */}
        <div style={tileStyle(TILE_NEW_KEY)}>
          <button onClick={() => setShowNewGroup(true)} className={dashedTileCls}>
            <FolderPlus size={18} />
            新建编组
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-white/25 pt-8 pb-2">继续向下滚动 · 编组与组件都存在本机，增删改刷新不丢 · 卡片可按住拖动排序 · 组件与编组可右键改尺寸</p>

      {/* 拖拽中的浮动卡片快照：跟随指针，带抬升阴影 */}
      {dragSnap && (
        <div
          ref={cloneRef}
          className="fixed left-0 top-0 z-[95] pointer-events-none will-change-transform"
          style={{ width: dragSnap.w, height: dragSnap.h }}
        >
          <div className="relative w-full h-full">
            <div
              className="w-full h-full rounded-[26px] overflow-hidden shadow-2xl shadow-black/80 ring-1 ring-white/25 opacity-95 scale-[1.02] [&>*]:h-full"
              dangerouslySetInnerHTML={{ __html: dragSnap.html }}
            />
            {/* 合并充能提示（第二十一轮修订，第三十七轮改 2 秒）：拖影底部进度条，满 2 秒点亮「可合并文件夹」 */}
            {chargeUi && (
              <div
                data-charge={chargeUi.ready ? 'ready' : 'charging'}
                className="absolute inset-x-3 bottom-3 z-10 rounded-xl bg-[#17171d]/95 border border-white/15 px-3 py-2"
              >
                <p className={`text-[11px] font-medium text-center ${chargeUi.ready ? 'text-indigo-300' : 'text-white/75'}`}>
                  {chargeUi.ready
                    ? chargeUi.kind === 'widget'
                      ? '可合并组件：压住另一张组件卡松手即合并'
                      : '可合并文件夹：压住另一张文件夹卡松手即合并'
                    : chargeUi.kind === 'widget'
                      ? '充能中…保持拖动，满 2 秒可合并组件'
                      : '充能中…保持拖动，满 2 秒可合并文件夹'}
                </p>
                <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    data-charge-progress
                    className={`h-full ${chargeUi.ready ? 'bg-indigo-400' : 'bg-white/50'}`}
                    style={{ width: `${Math.round(chargeUi.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* tab 拖出的拖影来源（屏外渲染）：被拖组的普通 C 卡，挂载后其 HTML 被取作拖拽快照 */}
      {tabSnap && (
        <div
          ref={tabSnapRef}
          aria-hidden
          className="fixed top-0 pointer-events-none"
          style={{ left: -9999, width: tabSnap.w, height: tabSnap.h }}
        >
          <GroupStackCard
            group={tabSnap.group}
            onOpen={() => {}}
            delay={0}
            colSpan={tabSnap.colSpan}
            heightUnits={tabSnap.heightUnits}
          />
        </div>
      )}

      {/* C 型编组弹窗（ICON 瓷砖） */}
      <GroupPanel group={panelGroup} store={store} onClose={() => setPanelGroupId(null)} onBecomeList={handleBecomeList} />

      {/* 组合弹窗（第二十一轮）：上下两个组的管理区 */}
      <ComboPanel
        combo={comboPanel}
        groups={comboPanelGroups}
        store={store}
        onClose={() => setComboPanelId(null)}
        onBecomeList={handleComboBecomeList}
      />

      {/* 右键尺寸菜单（实色）：A 型组件与 B 型编组共用 */}
      <AnimatePresence>
        {sizeMenu && sizeMenuLayout && (
          <motion.div
            ref={sizeMenuRef}
            data-size-menu
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="fixed z-[80] w-[200px] rounded-2xl bg-[#1e1e26] border border-white/15 shadow-2xl shadow-black/70 p-2.5"
            style={{ left: sizeMenu.x, top: sizeMenu.y }}
          >
            <p className="px-1 pb-2 text-[11px] font-medium text-white/60">{sizeMenuTitle}</p>
            <p className="px-1 pb-1 text-[10px] tracking-wider text-white/40 uppercase">宽度</p>
            <div className="flex gap-1 pb-2.5">
              {sizeMenuColOptions.map((n) => {
                const selected = sizeMenuLayout.colSpan === n;
                return (
                  <button
                    key={n}
                    onClick={() => applySizeMenuLayout({ colSpan: n })}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition-colors ${
                      selected ? 'bg-indigo-500/80 text-white font-semibold' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {selected && <Check size={12} />}
                    {n} 栏
                  </button>
                );
              })}
            </div>
            <p className="px-1 pb-1 text-[10px] tracking-wider text-white/40 uppercase">高度</p>
            <div className="flex gap-1">
              {sizeMenuHeightOptions.map((n) => {
                const selected = sizeMenuLayout.heightUnits === n;
                return (
                  <button
                    key={n}
                    onClick={() => applySizeMenuLayout({ heightUnits: n })}
                    className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition-colors ${
                      selected ? 'bg-indigo-500/80 text-white font-semibold' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {selected && <Check size={12} />}
                    {n}x
                  </button>
                );
              })}
            </div>
            {/* A 型组件专属：换个底色（第二十三轮随机重抽；第九十一轮展开选色面板——
                双色自定义边选边存边预览，随机/恢复默认保留为面板内按钮） */}
            {sizeMenu.kind === 'widget' &&
              (() => {
                const key = widgetCardKey(sizeMenu.id);
                const current = widgetTintOf(store.data.widgetTints, key);
                const from = current?.from ?? WIDGET_TINTS[0].from;
                const to = current?.to ?? WIDGET_TINTS[0].to;
                const panelOpen = tintPanelFor === key;
                // 排除全部已用色（含本卡当前色）：重抽必换色，且不与同屏其他组件撞色
                const reroll = () => {
                  const exclude: number[] = [];
                  for (const w of store.data.widgets) {
                    const v = store.data.widgetTints[widgetCardKey(w)];
                    if (typeof v === 'number') exclude.push(v);
                  }
                  store.setWidgetTint(key, pickWidgetTintIndex(exclude));
                  setSizeMenu(null);
                };
                return (
                  <>
                    <div className="my-2.5 h-px bg-white/10" />
                    <button
                      data-tint-panel-toggle
                      onClick={() => setTintPanelFor(panelOpen ? null : key)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <Palette size={12} /> 换个底色
                      <ChevronDown
                        size={12}
                        className={`transition-transform ${panelOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {panelOpen && (
                      <div data-tint-panel className="pt-2">
                        {/* 预览条：与卡面同一 vivid 处理 + 同一组 alpha 档，压在与卡面基底近色的深底上 */}
                        <div
                          data-tint-preview
                          className="mb-2.5 h-7 rounded-lg border border-white/10"
                          style={{
                            background: `linear-gradient(140deg, ${vivid(from, 0.6, 0.85)}57 0%, ${vivid(to, 0.74, 0.85)}31 52%, ${vivid(to, 0.74, 0.85)}15 100%), #26262e`,
                          }}
                        />
                        <TintColorRow
                          slot="from"
                          label="起点色"
                          value={from}
                          swatches={WIDGET_TINTS.map((t) => t.from)}
                          onPick={(hex) => store.setWidgetTintCustom(key, hex, to)}
                        />
                        <TintColorRow
                          slot="to"
                          label="终点色"
                          value={to}
                          swatches={WIDGET_TINTS.map((t) => t.to)}
                          onPick={(hex) => store.setWidgetTintCustom(key, from, hex)}
                        />
                        <div className="flex gap-1 pt-0.5">
                          <button
                            data-reroll-tint
                            onClick={reroll}
                            className="flex-1 py-1.5 rounded-lg text-xs bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                          >
                            随机一款
                          </button>
                          <button
                            data-tint-reset
                            onClick={reroll}
                            className="flex-1 py-1.5 rounded-lg text-xs bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                          >
                            恢复默认
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            {/* 组合卡专属：拆分组合（原位还原成左右两张普通 C 卡） */}
            {sizeMenu.kind === 'combo' && (
              <>
                <div className="my-2.5 h-px bg-white/10" />
                <button
                  data-combo-split
                  onClick={() => {
                    store.splitCombo(sizeMenu.id, baseOrder);
                    setSizeMenu(null);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <Unlink size={12} /> 拆分组合
                </button>
              </>
            )}
            {/* 组件摞专属：移出当前成员 / 拆分整摞（第七十二轮） */}
            {sizeMenu.kind === 'wstack' &&
              (() => {
                const stack = validWidgetStacks.find((s) => s.id === sizeMenu.id);
                if (!stack) return null;
                return (
                  <>
                    <div className="my-2.5 h-px bg-white/10" />
                    <button
                      data-wstack-extract
                      onClick={() => {
                        store.extractWidgetFromStack(stack.id, stack.activeWidgetId, baseOrder);
                        setSizeMenu(null);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <LogOut size={12} /> 移出「{widgetDefOf(stack.activeWidgetId).name}」
                    </button>
                    <button
                      data-wstack-split
                      onClick={() => {
                        store.splitWidgetStack(stack.id, baseOrder);
                        setSizeMenu(null);
                      }}
                      className="mt-1 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                    >
                      <Unlink size={12} /> 拆分组件摞
                    </button>
                  </>
                );
              })()}
            {/* 计划卡专属：卡面样式切换（列表式/焦点式，按卡片存 cardFaceStyles） */}
            {sizeMenu.kind === 'widget' && sizeMenu.id === 'task' && (
              <>
                <p className="px-1 pt-2.5 pb-1 text-[10px] tracking-wider text-white/40 uppercase">卡面样式</p>
                <div className="flex gap-1">
                  {(
                    [
                      { id: 'list', label: '列表式' },
                      { id: 'focus', label: '焦点式' },
                    ] as { id: CardFaceStyle; label: string }[]
                  ).map((s) => {
                    const selected = cardFaceStyleOf(store.data.cardFaceStyles, widgetCardKey('task')) === s.id;
                    return (
                      <button
                        key={s.id}
                        data-face-style={s.id}
                        onClick={() => store.setCardFaceStyle(widgetCardKey('task'), s.id)}
                        className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs transition-colors ${
                          selected ? 'bg-indigo-500/80 text-white font-semibold' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        {selected && <Check size={12} />}
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* 空白处右键菜单（第二十七轮，实色、跟随鼠标，风格同尺寸菜单） */}
      <AnimatePresence>
        {blankMenu && (
          <motion.div
            ref={blankMenuRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            data-blank-menu
            className="fixed z-[80] w-[200px] rounded-2xl bg-[#1e1e26] border border-white/15 shadow-2xl shadow-black/70 p-2"
            style={{ left: blankMenu.x, top: blankMenu.y }}
          >
            {comboCandidates.length >= 2 ? (
              <button
                data-blank-new-combo
                onClick={() => {
                  setBlankMenu(null);
                  setPickerSelected([]);
                  setShowComboPicker(true);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-white/80 hover:bg-white/8 hover:text-white transition-colors"
              >
                <Combine size={14} className="text-white/45" /> 新建组合
              </button>
            ) : (
              <div className="px-2.5 py-2 text-xs text-white/30 cursor-not-allowed" data-blank-new-combo-disabled>
                <span className="flex items-center gap-2">
                  <Combine size={14} /> 新建组合
                </span>
                <span className="block mt-1 text-[10px] text-white/30">需要至少 2 个文件夹式编组</span>
              </div>
            )}
            <button
              data-blank-add-widget
              onClick={() => {
                setBlankMenu(null);
                onNavigate('store');
              }}
              className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-white/80 hover:bg-white/8 hover:text-white transition-colors"
            >
              <LayoutGrid size={14} className="text-white/45" /> 添加组件
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 新建组合选择器：列出全部可合并的文件夹式编组，勾选恰好 2 个生成组合卡 */}
      <AnimatePresence>
        {showComboPicker && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowComboPicker(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              data-combo-picker
              className="rounded-[24px] bg-[#17171d] border border-white/15 w-full max-w-sm p-4 shadow-2xl shadow-black/70"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-sm">新建组合卡</h3>
                <button
                  onClick={() => setShowComboPicker(false)}
                  className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                  aria-label="关闭"
                >
                  <X size={15} />
                </button>
              </div>
              <p className="text-[11px] text-white/40 mb-3">选择两个文件夹式编组，合并成一张左右双 tab 的组合卡。</p>
              <div className="flex flex-col gap-1 max-h-[46vh] overflow-y-auto">
                {comboCandidates.map((g) => {
                  const selected = pickerSelected.includes(g.id);
                  const orderIdx = pickerSelected.indexOf(g.id);
                  const disabled = !selected && pickerSelected.length >= 2;
                  return (
                    <button
                      key={g.id}
                      data-picker-group={g.id}
                      onClick={() => togglePickerGroup(g.id)}
                      disabled={disabled}
                      className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-colors ${
                        selected
                          ? 'bg-indigo-500/15 border border-indigo-400/50'
                          : 'border border-transparent hover:bg-white/5'
                      } ${disabled ? 'opacity-35 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${
                          selected ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/30 text-transparent'
                        }`}
                      >
                        <Check size={12} strokeWidth={3} />
                      </span>
                      <StackGroupIcon group={g} size={26} />
                      <span className="flex-1 min-w-0 truncate text-sm">{g.name}</span>
                      {selected && (
                        <span className="text-[10px] text-indigo-300 shrink-0">{orderIdx === 0 ? '左 tab' : '右 tab'}</span>
                      )}
                      <span className="text-[11px] text-white/35 shrink-0">{g.sites.length} 个站点</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={createComboFromPicker}
                disabled={pickerSelected.length !== 2}
                data-combo-create
                className="mt-3.5 w-full py-2 rounded-xl bg-indigo-500/80 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                生成组合卡（已选 {pickerSelected.length}/2）
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 「主页组件」开关面板已于第七十四轮下线：添加/移除组件统一走组件商店页（顶部「添加组件」入口与空白菜单均跳 store 页） */}

      {/* 新建编组弹窗：先选形态（详细列表 / 文件夹式） */}
      <AnimatePresence>
        {showNewGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowNewGroup(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="rounded-[24px] bg-[#17171d] border border-white/10 w-full max-w-sm p-4 shadow-2xl shadow-black/60"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">新建编组</h3>
                <button onClick={() => setShowNewGroup(false)} className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10">
                  <X size={15} />
                </button>
              </div>
              <div className="relative">
                <input
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createGroup()}
                  placeholder="编组名称，如 影视娱乐"
                  autoFocus
                  maxLength={GROUP_NAME_MAX}
                  data-group-name-input
                  className="w-full bg-white/5 border border-white/12 rounded-xl px-3 py-2 pr-11 text-sm outline-none focus:border-indigo-400/50 placeholder:text-white/30"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">
                  {textCharCount(newGroupName)}/{GROUP_NAME_MAX}
                </span>
              </div>
              <p className="text-[11px] text-white/45 mt-3.5 mb-2">编组形态（之后也能在组内切换）</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setNewGroupDisplay('list')}
                  className={`text-left rounded-2xl border p-3 transition-colors ${
                    newGroupDisplay === 'list'
                      ? 'border-indigo-400/70 bg-indigo-500/15'
                      : 'border-white/12 bg-white/[0.03] hover:border-white/30'
                  }`}
                >
                  <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${newGroupDisplay === 'list' ? 'text-indigo-200' : ''}`}>
                    <List size={14} /> 详细列表
                  </span>
                  <span className="block text-[11px] text-white/45 leading-relaxed mt-1.5">
                    图标 + 名称 + 介绍成行展示，点开在主页原地向下拉开
                  </span>
                </button>
                <button
                  onClick={() => setNewGroupDisplay('stack')}
                  className={`text-left rounded-2xl border p-3 transition-colors ${
                    newGroupDisplay === 'stack'
                      ? 'border-indigo-400/70 bg-indigo-500/15'
                      : 'border-white/12 bg-white/[0.03] hover:border-white/30'
                  }`}
                >
                  <span className={`flex items-center gap-1.5 text-[13px] font-semibold ${newGroupDisplay === 'stack' ? 'text-indigo-200' : ''}`}>
                    <Folder size={14} /> 文件夹式
                  </span>
                  <span className="block text-[11px] text-white/45 leading-relaxed mt-1.5">
                    紧凑的小卡像文件夹，点开弹窗看组内图标
                  </span>
                </button>
              </div>
              <button
                onClick={createGroup}
                disabled={!newGroupName.trim()}
                className="mt-3.5 w-full py-2 rounded-xl bg-indigo-500/80 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                创建并添加网站
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
