import React, { useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import {
  taskFlatStats,
  widgetCardKey,
  widgetTintOf,
  type LocalStore,
} from '../../store/localStore';
import { AiView, PlansSection, TasksSection } from '../v2/TaskSections';
import { useCardDragScroll } from '../v2/TaskCard';
import WidgetTintLayer from '../v2/WidgetTint';

/**
 * 计划全窗页（第八十八轮，用户：「给计划做一个独立全窗页面，因为这是我们的重点小组件」）：
 * - 整页工作区：待办 / 长期计划双列铺开（沿用第八十七轮加密后的 pinned 紧凑结构——
 *   标题在顶、列表各自滚动占满中间、添加行钉列底），一屏可见条目远多于卡面；
 *   手机端双列改单列上下排（每列自带高度、自滚），功能不减。
 * - 数据与逻辑同源：与主页计划卡读写同一份 store（tasks/plans）与同一套节区组件
 *   （TasksSection / PlansSection / AiView 直接复用），页里改完回卡面即时一致、反之亦然；
 *   本页不持有任何计划数据状态，唯一的本地状态是主视图 / AI 整理切换（与卡面同语言）。
 * - 呈现沿用卡面材质：两列各是一面 .group-card-scope.widget-panel（与 2x 卡面同壳），
 *   专属底色与卡面同一份 widgetTints 分配；三档外观随 index.css 作用域规则自动适配，
 * * - 页头沿用子页样式（标题 + 说明，见组件商店页）；返回主页走顶栏 LOGO / 导航（子页惯例，
 *   顶栏不为本页加按钮）。卡内拖拽滚动复用 TaskCard 导出的 useCardDragScroll，按落点滚对应列。
 * - 本轮纯呈现层：数据结构与迁移一概不动，计划卡除卡头加入口外不改。
 */
export default function PlanPage({
  store,
  view,
  onViewChange,
  hideHeader = false,
  hideAiButton = false,
  flatPanels = false,
}: {
  store: LocalStore;
  /** 受控视图（桌面版用：AI 整理按钮已移到同步条，视图状态由 plan-app 持有） */
  view?: 'main' | 'ai';
  onViewChange?: (v: 'main' | 'ai') => void;
  /** 不渲染页头（桌面版用：标题与副标题、今日进度都不留，标题栏已有「杂盒计划」） */
  hideHeader?: boolean;
  /** 不渲染页头 AI 整理按钮（桌面版用：按钮已移到同步条） */
  hideAiButton?: boolean;
  /** 平铺节区（桌面版用）：去掉圆角卡框，待办与长期计划直接上下排、页面整体滚动 */
  flatPanels?: boolean;
}) {
  const { tasks, plans } = store.data;
  /** 主视图 / AI 整理（与 2x 卡面头部同一对视图、同一切换语言） */
  const [innerView, setInnerView] = useState<'main' | 'ai'>('main');
  const curView = view ?? innerView;
  const setView = (v: 'main' | 'ai') => {
    if (view === undefined) setInnerView(v);
    onViewChange?.(v);
  };
  const dragScroll = useCardDragScroll();

  // 进度口径与卡面头部一致：组按子任务摊平（taskFlatStats）
  const { total, done } = taskFlatStats(tasks);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  /* 专属底色与卡面同一份分配（widgetCardKey('task')）；未分配（从未打开过主页）时为
   * undefined、面板不叠底色层，与卡面同口径。水印沿用第八十七轮规则：双列都空才淡显 */
  const tint = widgetTintOf(store.data.widgetTints, widgetCardKey('task'));
  const bothEmpty = tasks.length === 0 && plans.length === 0;


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
              待办与长期计划的全窗工作区——和主页计划卡同一份数据，在哪边改都即时同步。
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
      ) : flatPanels ? (
        /* 平铺（桌面版）：不要圆角卡框，待办在上、长期计划在下直接排，页面整体滚动；
           节区不用 pinned（无固定列高、无列内滚动），列表自然伸展、添加行跟在列表后 */
        <div className="flex flex-col gap-8">
          <TasksSection store={store} />
          <PlansSection store={store} />
        </div>
      ) : (
        /* 双列工作区：桌面吃满剩余视口高（两列 pinned 各自滚动），手机单列上下排、
           每列 68dvh 自滚；拖拽滚动按指针落点找 [data-task-col-scroll] 接管对应列 */
        <div
          ref={dragScroll.scrollRef}
          onPointerDown={dragScroll.onPointerDown}
          onClickCapture={dragScroll.onClickCapture}
          data-task-scroll
          data-nodrag
          className="md:h-[calc(100dvh-13.5rem)] md:min-h-[26rem]"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:h-full min-h-0">
            <div
              data-plan-panel="tasks"
              className={`${panelCls} h-[68dvh] min-h-[24rem] md:h-auto md:min-h-0`}
            >
              {tint && (
                <WidgetTintLayer tint={tint} emoji="📋" watermarkOpacity={bothEmpty ? 0.1 : 0} />
              )}
              <div className="relative h-full min-h-0">
                <TasksSection store={store} pinned />
              </div>
            </div>
            <div
              data-plan-panel="plans"
              className={`${panelCls} h-[68dvh] min-h-[24rem] md:h-auto md:min-h-0`}
            >
              {tint && <WidgetTintLayer tint={tint} emoji="📋" watermarkOpacity={0} />}
              <div className="relative h-full min-h-0">
                <PlansSection store={store} pinned />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
