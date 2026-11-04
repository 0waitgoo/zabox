import React, { useEffect, useState } from 'react';
import {
  widgetCardKey,
  widgetTintOf,
  type LocalStore,
  type WidgetId,
  type WidgetLayout,
  type WidgetStackItem,
} from '../../store/localStore';
import { widgetDefOf } from './widgetRegistry';
import { closeToolsWorkspace, getToolsWorkspace } from '../../store/toolsWorkspace';

/**
 * A 型组件摞（第七十二轮）：多个小组件叠成一张卡——卡顶部一条成员标题排
 * （各成员的图标 + 名字并排，点任意标题切到该成员，当前成员高亮），下方是
 * 当前成员的完整卡面（成员组件原样渲染，自有卡头/按钮/底色全部保留）。
 *
 * 成员挂载策略（设计定稿「切过去再加载、带缓存」）：成员首次成为当前成员时才挂载
 * （资讯/话题在这时才发请求），挂载过就保持挂载、非当前时仅 display:none 隐藏——
 * 切回来不重拉数据、不丢内部状态（计划的卡内视图、滚动位置等都原样保留）。
 * 标题排占卡外一行的瘦高（约 30px），成员卡面吃剩余高度，成员自身高度语义
 * （1x/2x 的紧凑/全功能面）由摞的尺寸决定，与它独立时一致。
 */
export default function WidgetStackCard({
  stack,
  store,
  onNavigate,
  layout,
  delay = 0,
  phone,
}: {
  stack: WidgetStackItem;
  store: LocalStore;
  onNavigate: (page: string) => void;
  /** 摞的生效布局（整摞尺寸，成员跟随） */
  layout: WidgetLayout;
  delay?: number;
  /** 手机单列呈现（宽按 1 栏传给尺寸感知组件，与主页现状口径一致） */
  phone?: boolean;
}) {
  /* 已挂载过的成员集合：当前成员必在其中；成员被移出摞后随之清理，防残留 DOM */
  const [mounted, setMounted] = useState<WidgetId[]>(() => [stack.activeWidgetId]);
  useEffect(() => {
    setMounted((prev) => (prev.includes(stack.activeWidgetId) ? prev : [...prev, stack.activeWidgetId]));
  }, [stack.activeWidgetId]);
  useEffect(() => {
    setMounted((prev) => {
      const next = prev.filter((id) => stack.widgetIds.includes(id));
      return next.length === prev.length ? prev : next;
    });
  }, [stack.widgetIds]);

  /* 文件工具工作区开着时切到别的成员（第八十六轮）：工作区随之收起——
   * 否则 HomePage 会继续按「工作区打开」把整摞撑到 3 行高，而当前成员并没在用工作区。
   * 工作区内部状态由 FileToolsCard 常驻挂载保留，切回来再打开不丢已选文件/结果 */
  useEffect(() => {
    if (stack.activeWidgetId !== 'tools' && getToolsWorkspace().open) closeToolsWorkspace();
  }, [stack.activeWidgetId]);

  return (
    <div className="h-full flex flex-col" data-widget-stack={stack.id}>
      {/* 顶部成员标题排：点标题切换；当前成员实底高亮，其余为半透明深色片（页面背景三档都成立） */}
      <div className="flex items-center gap-1.5 px-0.5 pb-2 shrink-0" data-stack-tabs>
        {stack.widgetIds.map((id) => {
          const def = widgetDefOf(id);
          const Icon = def.icon;
          const active = id === stack.activeWidgetId;
          return (
            <button
              key={id}
              type="button"
              data-stack-tab={id}
              data-active={active ? 'true' : undefined}
              title={def.name}
              onClick={() => store.setWidgetStackActive(stack.id, id)}
              className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap border transition-colors ${
                active
 ? 'bg-indigo-500 border-indigo-400 text-white'
                  : 'bg-[#23232c]/85 border-white/10 text-white/55 hover:text-white hover:border-white/25'
              }`}
            >
              <span
                className={`w-[18px] h-[18px] rounded-full flex items-center justify-center shrink-0 ${
                  active ? 'bg-white/20 text-white' : 'bg-white/10 text-white/70'
                }`}
              >
                <Icon size={11} />
              </span>
              {def.name}
            </button>
          );
        })}
        <span className="ml-auto pl-1 text-[10px] tabular-nums text-white/35 shrink-0">
          {stack.widgetIds.length}/4
        </span>
      </div>

      {/* 当前成员卡面：挂载过的成员都在 DOM 里，非当前隐藏（保状态），当前吃满剩余高度 */}
      <div className="flex-1 min-h-0">
        {mounted
          .filter((id) => stack.widgetIds.includes(id))
          .map((id) => {
            const def = widgetDefOf(id);
            const Member = def.component;
            const active = id === stack.activeWidgetId;
            return (
              <div key={id} className={active ? 'h-full' : 'hidden'} data-stack-member={id}>
                <Member
                  store={store}
                  onNavigate={onNavigate}
                  tint={widgetTintOf(store.data.widgetTints, widgetCardKey(id))}
                  layout={layout}
                  delay={delay}
                  phone={phone}
                />
              </div>
            );
          })}
      </div>
    </div>
  );
}
