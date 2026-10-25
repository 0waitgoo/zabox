import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, CalendarDays, CalendarRange, Check, Layers, ListTodo, Maximize2, Sparkles, Target } from 'lucide-react';
import {
  cardFaceStyleOf,
  isTaskGroup,
  taskChildProgress,
  taskEntryDone,
  taskFlatStats,
  taskGroupDone,
  widgetCardKey,
  type LocalStore,
  type TaskItem,
  type WidgetTint,
} from '../../store/localStore';
import { AiView, PlansSection, TasksSection } from './TaskSections';
import { TimelineView, WeekGridView } from './PlanScheduleViews';
import WidgetTintLayer from './WidgetTint';

/**
 * A 型 · 计划任务卡（第十八轮，替换原「今日任务」占位卡；第十九轮加待办分组）
 * 数据走 localStore 的 tasks/plans（本地优先，随导出/文件/GitHub 同步一起走）。
 * 卡面两样式（右键菜单切换，按卡片存 cardFaceStyles）：
 * - list 列表式（默认）：今日进度 x/y + 细进度线 + 前 3 条未完成待办（卡面可直接勾，勾完划线留影片刻后移出）
 * - focus 焦点式：只突出第一条未完成待办（大字）+「还有 N 件」
 * 进度计数口径（第十九轮）：组按子任务摊平计数（见 localStore.taskFlatStats）。
 * 第二十五轮（尺寸布局）：高 1x 简洁卡面只展示进度与待办行；高 2x 面板式布局——
 * 复用 TaskSections 的 TasksSection/PlansSection，勾选/添加/计划 +1 与完成在卡内直接可用。
 * 第六十九轮（展开面板取消）：
 * - 「展开」按钮与展开面板（TaskPanel）删除，全部操作回到卡面：2x 卡面全功能（建组、
 *   新建计划表单、行右键编辑/删除、已完成管理、拖拽合并），AI 整理改为头部按钮切换卡内视图；
 *   1x 卡面不再点开任何面板，只保留勾选与标题点开全文
 * - 标题截断改点击展开：待办行点文字展开全文、再点收起（1x/2x 同口径，勾选框不触发）
 * - 2x 内容区支持鼠标按住拖拽滚动（useCardDragScroll），与待办合并拖拽分领地共存（见其注释）
 * 第七十五轮（收起态行数）：2x 标题与焦点式大标题收起态统一为最多 2 行（line-clamp-2，点击仍
 * 展开全文）；1x 列表式行保留 1 行截断——1x 卡面固定只摆 3 行、高度预算仅够单行/行，改 2 行
 * 任一行变高都会把最后一行挤出卡面（overflow-hidden 直接切掉），属刻意紧凑设计，展开全文不受影响
 * 第八十七轮（2 栏布局加密，用户：「尽可能显示更多的项目内容」）：2 栏时内容区改每列独立
 * 结构——各列「标题在顶 → 列表区各自滚动占满中间 → 添加行钉列底」（sections 的 pinned 模式），
 * 壳内边距/头部间距收一档；水印改为待办与计划双列都空时才淡显，有任何条目即隐藏；
 * 卡内拖拽滚动随之泛化到每列自己的滚动区（[data-task-col-scroll]）。1 栏堆叠仍走共享滚动。
 * 第八十八轮（计划全窗页）：1x/2x 两壳卡头加「打开计划页」入口（语言仿资讯卡「进入资讯页」，
 * 由注册表注入 onOpenPlanPage、商店预览等无导航场景不传则不渲染）；卡面其余结构不动；
 * useCardDragScroll 导出供 PlanPage 复用同一套拖拽滚动。
 */
export default function TaskCard({
  store,
  delay = 0,
  colSpan = 1,
  heightUnits = 1,
  tint,
  onOpenPlanPage,
}: {
  store: LocalStore;
  delay?: number;
  /** 右键布局宽度（2x 面板式布局时决定双列/堆叠） */
  colSpan?: 1 | 2;
  /** 右键布局高度：1 = 简洁卡面，2 = 全功能卡面（操作都在卡内完成） */
  heightUnits?: 1 | 2;
  /** 专属底色（第二十三轮，由 HomePage 按 widgetTints 分配传入；1x/2x 两壳都生效） */
  tint?: WidgetTint;
  /** 打开计划全窗页（第八十八轮）：由注册表按 onNavigate 注入；不传则不渲染卡头入口 */
  onOpenPlanPage?: () => void;
}) {
  const { tasks, plans, cardFaceStyles } = store.data;
  const face = cardFaceStyleOf(cardFaceStyles, widgetCardKey('task'));
  /** 刚在卡面上勾完的待办：先划线留影，片刻后才移出前 3（避免勾完瞬间跳变） */
  const [justDone, setJustDone] = useState<Record<string, true>>({});
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  /** 1x 卡面：标题被点开全文的行 id（同一时刻只开一行）与焦点式标题展开态（第六十九轮） */
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [focusExpanded, setFocusExpanded] = useState(false);
  /** 2x 卡面视图：主视图（待办+计划）/ AI 整理（第六十九轮从面板迁入卡内切换） */
  const [cardView, setCardView] = useState<'main' | 'ai'>('main');
  /** 2x 卡面 tab（本轮改成标题 tab）：计划（待办）| 长期计划 | 日程表 | 推进表——只在卡内切换视图，不开新页面；
      当前 tab 记本地（显示偏好，不进同步），下次打开还是这个 tab；
      1 栏（colSpan 1）时 tab 只留图标（窄卡放不下文字时同口径） */
  const [planTab, setPlanTab] = useState<'plan' | 'plans' | 'timeline' | 'week'>(() => {
    try {
      const saved = localStorage.getItem('ainav-plan-card-tab');
      return saved === 'plans' || saved === 'timeline' || saved === 'week' ? saved : 'plan';
    } catch {
      return 'plan';
    }
  });
  const switchPlanTab = (tab: 'plan' | 'plans' | 'timeline' | 'week') => {
    setPlanTab(tab);
    try {
      localStorage.setItem('ainav-plan-card-tab', tab);
    } catch {
      /* 忽略 */
    }
  };
  const dragScroll = useCardDragScroll();

  // 进度口径：组按子任务摊平（普通待办计 1，组计子任务数），见 taskFlatStats
  const { total, done: doneCount } = taskFlatStats(tasks);
  const open = tasks.filter((t) => !taskEntryDone(t));
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const handleToggle = (task: TaskItem) => {
    store.toggleTask(task.id);
    if (!task.done) {
      // 勾上：留影 0.9 秒后移出
      setJustDone((prev) => ({ ...prev, [task.id]: true }));
      const timer = setTimeout(() => {
        setJustDone((prev) => {
          const next = { ...prev };
          delete next[task.id];
          return next;
        });
        timers.current.delete(task.id);
      }, 900);
      timers.current.set(task.id, timer);
    } else if (justDone[task.id]) {
      const timer = timers.current.get(task.id);
      if (timer) clearTimeout(timer);
      timers.current.delete(task.id);
      setJustDone((prev) => {
        const next = { ...prev };
        delete next[task.id];
        return next;
      });
    }
  };

  // 列表式可见行：按数据顺序取前 3 个顶层条目（未完成的普通待办 + 正在留影的已完成 + 未全勾的组）
  const rows: TaskItem[] = [];
  for (const t of tasks) {
    if (rows.length >= 3) break;
    if (isTaskGroup(t)) {
      if (!taskGroupDone(t)) rows.push(t);
    } else if (!t.done || justDone[t.id]) {
      rows.push(t);
    }
  }

  const focusTask = open[0];
  const restCount = Math.max(0, open.length - 1);

  /** 专属底色层（第二十三轮）：1x/2x 两壳共用，内容以 relative 层级盖在其上；
   * 水印单独调低（第五十二轮）：2x 时 📋 正压在长期计划区，0.16 会干扰阅读，降到 0.1；
   * 第八十七轮：水印只在待办与计划都为空时淡显（0.1），有任何条目即隐藏，不占视觉 */
  const bothEmpty = tasks.length === 0 && plans.length === 0;
  const tintLayer = tint ? <WidgetTintLayer tint={tint} emoji="📋" watermarkOpacity={bothEmpty ? 0.1 : 0} /> : null;

  /* 「打开计划页」入口（第八十八轮，1x/2x 两壳共用；本轮改成展开图标，不占文字位） */
  const planPageEntry = onOpenPlanPage ? (
    <button
      type="button"
      data-plan-open
      title="打开计划页"
      aria-label="打开计划页"
      onClick={onOpenPlanPage}
      className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/[0.18] text-zinc-200 hover:text-white flex items-center justify-center transition-colors shrink-0"
    >
      <Maximize2 size={13} />
    </button>
  ) : null;

  /* ---------- 高 2x：全功能卡面（双列内容与原面板同一套组件；头部 AI 整理切换卡内视图） ---------- */
  if (heightUnits === 2) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay }}
        data-task-card
        data-task-mode="full"
        className="group-card-scope widget-panel widget-panel-hover relative rounded-[28px] h-full p-3.5 sm:p-4 flex flex-col overflow-hidden transition-colors"
      >
        {tintLayer}
        <div className="relative flex flex-col flex-1 min-h-0">
        {/* 头部（本轮改成标题 tab）：计划 | 长期计划 | 日程表 | 推进表 + 今日进度 + 展开图标 + AI 整理图标；
            1 栏时 tab 只留图标（窄卡放不下文字时同口径），2 栏时图标 + 文字 */}
        <div className="flex items-center gap-1.5 mb-2 shrink-0">
          <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/5 border border-white/10">
            {([
              ['plan', '计划', ListTodo],
              ['plans', '长期计划', Target],
              ['timeline', '日程表', CalendarDays],
              ['week', '推进表', CalendarRange],
            ] as const).map(([tab, label, Icon]) => (
              <button
                key={tab}
                type="button"
                data-plan-tab={tab}
                title={label}
                aria-label={label}
                onClick={() => switchPlanTab(tab)}
                className={`${colSpan === 1 ? 'w-7 h-7 flex items-center justify-center' : 'flex items-center gap-1 px-2.5 py-1.5'} rounded-lg transition-colors ${
                  planTab === tab ? 'bg-indigo-500/80 text-white font-medium' : 'text-white/55 hover:text-white/85'
                }`}
              >
                <Icon size={13} />
                {colSpan !== 1 && <span className="text-xs">{label}</span>}
              </button>
            ))}
          </div>
          <span data-task-progress className="ml-auto text-xs text-zinc-300 tabular-nums">
            {doneCount}/{total}
          </span>
          {planPageEntry}
          <button
            type="button"
            data-ai-open
            title={cardView === 'ai' ? '返回' : 'AI 整理'}
            aria-label={cardView === 'ai' ? '返回' : 'AI 整理'}
            onClick={() => setCardView((v) => (v === 'ai' ? 'main' : 'ai'))}
            className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/[0.18] text-zinc-200 hover:text-white flex items-center justify-center transition-colors shrink-0"
          >
            {cardView === 'ai' ? <ArrowLeft size={13} /> : <Sparkles size={13} />}
          </button>
        </div>
        <div className="h-1 rounded-full bg-white/20 overflow-hidden shrink-0 mb-2">
          <div className="h-full rounded-full bg-indigo-400 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>

        {cardView === 'ai' ? (
          <div className="flex-1 min-h-0 flex flex-col" data-nodrag>
            <AiView store={store} onDone={() => setCardView('main')} />
          </div>
        ) : planTab === 'timeline' ? (
          <div data-nodrag className="flex-1 min-h-0 overflow-y-auto pr-0.5">
            <TimelineView store={store} onAddPlan={() => switchPlanTab('plans')} />
          </div>
        ) : planTab === 'week' ? (
          <div data-nodrag className="flex-1 min-h-0 overflow-y-auto pr-0.5">
            <WeekGridView store={store} onGoPlan={() => switchPlanTab('plans')} />
          </div>
        ) : planTab === 'plans' ? (
          <div
            ref={dragScroll.scrollRef}
            onPointerDown={dragScroll.onPointerDown}
            onClickCapture={dragScroll.onClickCapture}
            data-task-scroll
            data-nodrag
            className="flex-1 min-h-0 flex flex-col"
          >
            <PlansSection store={store} pinned />
          </div>
        ) : (
          <div
            ref={dragScroll.scrollRef}
            onPointerDown={dragScroll.onPointerDown}
            onClickCapture={dragScroll.onClickCapture}
            data-task-scroll
            data-nodrag
            className="flex-1 min-h-0 flex flex-col"
          >
            <TasksSection store={store} pinned />
          </div>
        )}
        </div>
      </motion.div>
    );
  }

  /* ---------- 高 1x：简洁卡面（只展示与勾选；点标题展开全文，不再打开任何面板） ---------- */
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      data-task-card
      data-task-face={face}
      className="group-card-scope widget-panel widget-panel-hover relative rounded-[28px] h-full p-4 sm:p-5 flex flex-col overflow-hidden transition-colors"
    >
      {tintLayer}
      <div className="relative flex flex-col flex-1 min-h-0">
      {/* 头部：标题 + 今日进度 */}
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <div className="w-7 h-7 rounded-full bg-indigo-500 text-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] ring-1 ring-black/20 flex items-center justify-center shrink-0">
          <ListTodo size={14} />
        </div>
        <h3 className="font-semibold text-base sm:text-lg tracking-tight">计划</h3>
        <span data-task-progress className="ml-auto text-xs text-zinc-300 tabular-nums">
          {doneCount}/{total}
        </span>
        {planPageEntry}
      </div>
      <div className="h-1 rounded-full bg-white/20 overflow-hidden shrink-0 mb-2">
        <div className="h-full rounded-full bg-indigo-400 transition-all duration-300" style={{ width: `${pct}%` }} />
      </div>

      {face === 'list' ? (
        <div className="flex-1 min-h-0 flex flex-col gap-1">
          {rows.length === 0 ? (
            <p className="flex-1 flex items-center text-[13px] text-zinc-300">暂无待办。</p>
          ) : (
            rows.map((t) =>
              isTaskGroup(t) ? (
                // 组行：不给勾选框（子任务在 2x 卡面处理），显示「组名 · n/m」；点组名展开全文
                <div key={t.id} data-task-group-row className="flex items-center gap-2 py-1 min-w-0">
                  <span className="w-[18px] h-[18px] rounded-[5px] bg-white/[0.12] text-zinc-200 flex items-center justify-center shrink-0">
                    <Layers size={11} />
                  </span>
                  <span
                    data-task-title
                    onClick={() => setExpandedRowId((id) => (id === t.id ? null : t.id))}
                    className={`text-[13px] text-white/85 ${expandedRowId === t.id ? 'whitespace-normal break-words' : 'truncate'}`}
                  >
                    {t.title}
                  </span>
                  <span data-task-group-progress className="text-[11px] text-zinc-300 tabular-nums shrink-0">
                    · {taskChildProgress(t).done}/{taskChildProgress(t).total}
                  </span>
                </div>
              ) : (
                <div key={t.id} className="flex items-center gap-2 py-1 min-w-0">
                  <button
                    type="button"
                    aria-label={t.done ? '取消完成' : '标记完成'}
                    onClick={() => handleToggle(t)}
                    className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${
                      t.done ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/50 hover:border-indigo-300 text-transparent'
                    }`}
                  >
                    <Check size={12} strokeWidth={3} />
                  </button>
                  <span
                    data-task-title
                    onClick={() => setExpandedRowId((id) => (id === t.id ? null : t.id))}
                    className={`text-[13px] ${
                      expandedRowId === t.id ? 'whitespace-normal break-words' : 'truncate'
                    } ${t.done ? 'line-through text-white/35' : 'text-white/85'}`}
                  >
                    {t.title}
                  </span>
                </div>
              ),
            )
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col">
          {focusTask ? (
            <>
              <p className="text-[11px] tracking-wider text-zinc-300 uppercase mb-1.5">下一件事</p>
              <p
                data-task-focus-title
                onClick={() => setFocusExpanded((v) => !v)}
                className={`text-xl font-semibold leading-snug ${focusExpanded ? '' : 'line-clamp-2'}`}
              >
                {focusTask.title}
              </p>
              {isTaskGroup(focusTask) && (
                <p className="mt-1 text-xs text-zinc-300 tabular-nums">
                  一组 {taskChildProgress(focusTask).total} 项 · 已完成 {taskChildProgress(focusTask).done}
                </p>
              )}
              <p className="mt-auto text-xs text-zinc-300">
                {restCount > 0 ? `还有 ${restCount} 件` : '就这一件了'}
              </p>
            </>
          ) : (
            <>
              <p className="text-[11px] tracking-wider text-zinc-300 uppercase mb-1.5">下一件事</p>
              <p className="text-xl font-semibold leading-snug text-zinc-200">暂无待办</p>
            </>
          )}
        </div>
      )}
      </div>
    </motion.div>
  );
}

/** 拖拽滚动的起手阈值（px）：小于它松手算点击，大于它算拖拽且吞掉随后的 click */
const SCROLL_DRAG_THRESHOLD = 5;

/**
 * 卡内拖拽滚动（第六十九轮，2x 卡面内容区）：鼠标按住内容区拖动即滚动列表，不依赖滚轮/滚动条；
 * 触摸端不动（原生滚动本就有，且 pointerType 只认 mouse）。
 * 与待办合并拖拽（useTaskMergeDrag）的分工——两者都想接管「行上按下+移动」：
 * - 顶层待办行/组块（[data-task-entry]）是合并拖拽的领地，本手势不作起手，合并功能原样保留；
 * - 其余区域（计划行行身、节标题、已完成行、空白与间隙）按下拖动 = 滚动；
 * - 按钮/输入框等控件不作起手，原有点击不受影响。
 * 消歧：位移 ≤ 阈值松手 = 普通点击（不滚动、不吞 click）；超过阈值 = 拖拽滚动，
 * 松手后 400ms 内由 onClickCapture 吞掉紧随的 click，避免拖完顺手把条目点开/勾上。
 * 第八十七轮：滚动目标在按下时按落点决定——落点在某列自己的滚动区（[data-task-col-scroll]，
 * 2 栏 pinned 结构）就滚那一列，否则滚共享容器（scrollRef，1 栏堆叠）。
 */
export function useCardDragScroll() {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startTop: number; el: HTMLElement; dragging: boolean } | null>(null);
  const suppressAtRef = useRef(0);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const el = d?.el;
      if (!d || !el || e.pointerId !== d.pointerId) return;
      const dy = e.clientY - d.startY;
      if (!d.dragging) {
        if (Math.abs(dy) <= SCROLL_DRAG_THRESHOLD) return;
        d.dragging = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      el.scrollTop = d.startTop - dy;
    };
    const onPointerEnd = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      if (d.dragging) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        suppressAtRef.current = Date.now();
      }
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      if (dragRef.current?.dragging) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      dragRef.current = null;
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || dragRef.current) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-task-entry], [data-row-menu], [data-done-clear-menu]')) return;
    if (t.closest('button, input, textarea, select, a, form, [contenteditable="true"]')) return;
    const el = t.closest<HTMLElement>('[data-task-col-scroll]') ?? scrollRef.current;
    if (!el) return;
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY, startTop: el.scrollTop, el, dragging: false };
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressAtRef.current && Date.now() - suppressAtRef.current < 400) {
      suppressAtRef.current = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return { scrollRef, onPointerDown, onClickCapture };
}
