import React, { useState } from 'react';
import { ArrowLeft, CalendarDays, CalendarRange, ListTodo, Sparkles } from 'lucide-react';
import {
  taskFlatStats,
  widgetCardKey,
  widgetTintOf,
  type LocalStore,
} from '../../store/localStore';
import { AiView, TasksSection } from '../v2/TaskSections';
import { MonthView, TimelineView } from '../v2/PlanScheduleViews';
import WidgetTintLayer from '../v2/WidgetTint';

/**
 * 计划全窗页（第八十八轮，用户：「给计划做一个独立全窗页面，因为这是我们的重点小组件」，
 * 2026-10-26 重新设计后与卡面同语言：计划 | 日程表 | 推进表 三 tab 全宽切换，不再双列堆叠——
 * 旧双列（待办与日程表各占半屏定高、推进表沉底）一屏大半是空、推进表还要往下翻才看得到；
 * tab 全宽后每视图独占整页宽度，自然滚动，卡面与全屏页共用同一 tab 记忆 key，进出一致）：
 * - 数据与逻辑同源：与主页计划卡读写同一份 store（tasks/plans），页里改完回卡面即时一致、
 *   反之亦然；本页不持有任何计划数据状态，唯一的本地状态是主视图 / AI 整理切换（与卡面同语言）。
 * - 呈现沿用卡面材质：AI 整理视图仍是一面 .group-card-scope.widget-panel（与 2x 卡面同壳），
 *   专属底色与卡面同一份 widgetTints 分配；三档外观随 index.css 作用域规则自动适配，
 *   返回主页走顶栏 LOGO / 导航（子页惯例，顶栏不为本页加按钮）。
 */
export default function PlanPage({
  store,
  view,
  onViewChange,
  hideHeader = false,
  hideAiButton = false,
}: {
  store: LocalStore;
  /** 受控视图（桌面版用：AI 整理按钮已移到同步条，视图状态由 plan-app 持有） */
  view?: 'main' | 'ai';
  onViewChange?: (v: 'main' | 'ai') => void;
  /** 不渲染页头（桌面版用：标题与副标题、今日进度都不留，标题栏已有「杂盒计划」） */
  hideHeader?: boolean;
  /** 不渲染页头 AI 整理按钮（桌面版用：按钮已移到同步条） */
  hideAiButton?: boolean;
  /** 平铺（桌面版用）：保留兼容，主视图本就不带卡框，此 prop 不再改变布局 */
  flatPanels?: boolean;
}) {
  const { tasks } = store.data;
  /** 主视图 / AI 整理（与 2x 卡面头部同一对视图、同一切换语言） */
  const [innerView, setInnerView] = useState<'main' | 'ai'>('main');
  const curView = view ?? innerView;
  const setView = (v: 'main' | 'ai') => {
    if (view === undefined) setInnerView(v);
    onViewChange?.(v);
  };
  /** 全屏页 tab：与卡面共用同一记忆 key（ainav-plan-card-tab），卡面切到哪页、全屏页就打开哪页 */
  const [planTab, setPlanTab] = useState<'plan' | 'timeline' | 'month'>(() => {
    try {
      const saved = localStorage.getItem('ainav-plan-card-tab');
      return saved === 'timeline' || saved === 'month' ? saved : 'plan';
    } catch {
      return 'plan';
    }
  });
  const switchPlanTab = (tab: 'plan' | 'timeline' | 'month') => {
    setPlanTab(tab);
    try {
      localStorage.setItem('ainav-plan-card-tab', tab);
    } catch {
      /* 忽略 */
    }
  };

  // 进度口径与卡面头部一致：组按子任务摊平（taskFlatStats）
  const { total, done } = taskFlatStats(tasks);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  /* 专属底色与卡面同一份分配（widgetCardKey('task')）；未分配（从未打开过主页）时为
   * undefined、面板不叠底色层，与卡面同口径 */
  const tint = widgetTintOf(store.data.widgetTints, widgetCardKey('task'));

  const panelCls =
    'group-card-scope widget-panel relative rounded-[28px] overflow-hidden p-3.5 sm:p-4';

  return (
    <div data-plan-page className="flex flex-col gap-4">

      {/* 页头：沿用子页样式（标题 + 说明）；右侧今日进度与 AI 整理切换（与卡面头部同语言）；
          桌面版不渲染页头（标题栏已有「杂盒计划」） */}
      {!hideHeader && (
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">计划</h2>
            <p className="text-xs sm:text-sm text-white/45 mt-1">
              待办、日程表与推进表的全窗工作区——和主页计划卡同一份数据，在哪边改都即时同步。
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span data-plan-page-progress className="text-xs text-white/50 tabular-nums">
              今日进度 {done}/{total} · {pct}%
            </span>
            {!hideAiButton && (
              <button
                type="button"
                data-ai-open
                onClick={() => setView(curView === 'ai' ? 'main' : 'ai')}
                className="flex items-center gap-1 text-[11px] font-medium text-zinc-200 hover:text-white bg-white/10 hover:bg-white/[0.18] px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
              >
                {curView === 'ai' ? (
                  <>
                    <ArrowLeft size={12} /> 返回
                  </>
                ) : (
                  <>
                    <Sparkles size={12} /> AI 整理
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {curView === 'ai' ? (
        /* AI 整理：与卡面同一个 AiView，本页给它整页高度（内部自带滚动） */
        <div
          className={`${panelCls} h-[calc(100dvh-13.5rem)] min-h-[26rem] flex flex-col`}
        >
          {tint && <WidgetTintLayer tint={tint} emoji="📋" watermarkOpacity={0} />}
          <div className="relative flex flex-col flex-1 min-h-0" data-nodrag>
            <AiView store={store} onDone={() => setView('main')} />
          </div>
        </div>
      ) : (
        /* 主视图：与卡面同一组 tab（计划 | 日程表 | 推进表），每视图独占整页宽度、自然滚动；
           不再双列定高堆叠——旧布局一屏大半是空、推进表还要往下翻才看得到 */
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-1.5 shrink-0">
            <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/5 border border-white/10">
              {([
                ['plan', '计划', ListTodo],
                ['timeline', '日程表', CalendarDays],
                ['month', '推进表', CalendarRange],
              ] as const).map(([tab, label, Icon]) => (
                <button
                  key={tab}
                  type="button"
                  data-plan-page-tab={tab}
                  title={label}
                  aria-label={label}
                  onClick={() => switchPlanTab(tab)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-lg transition-colors text-xs ${
                    planTab === tab ? 'bg-indigo-500/80 text-white font-medium' : 'text-white/55 hover:text-white/85'
                  }`}
                >
                  <Icon size={13} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
          {planTab === 'timeline' ? (
            <TimelineView store={store} />
          ) : planTab === 'month' ? (
            <MonthView store={store} />
          ) : (
            <TasksSection store={store} />
          )}
        </div>
      )}
    </div>
  );
}
