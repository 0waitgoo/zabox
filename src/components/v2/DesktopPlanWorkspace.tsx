import React, { useEffect, useState } from 'react';
import type { LocalStore } from '../../store/localStore';
import { TasksSection } from './TaskSections';
import { MonthView, TimelineView } from './PlanScheduleViews';

/** 桌面工作区 tab：待办 / 日程表（单日）/ 推进表（多日区间），与网页版计划卡同语言。
 *  长期计划一节已随网页版重新设计删除（旧 PlansSection 不复存在，桌面版不再引用它）。 */
export type WorkspaceTab = 'task' | 'timeline' | 'month';

/** Use window shape, rather than a device breakpoint, for the desktop layout. */
export default function DesktopPlanWorkspace({ store, active, onActiveChange }: {
  store: LocalStore;
  active: WorkspaceTab;
  onActiveChange: (tab: WorkspaceTab) => void;
}) {
  const [wide, setWide] = useState(() => window.matchMedia('(orientation: landscape)').matches);
  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape)');
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const TABS: { id: WorkspaceTab; label: string }[] = [
    { id: 'task', label: '待办' },
    { id: 'timeline', label: '日程表' },
    { id: 'month', label: '推进表' },
  ];
  const tabs = (
    <div role="tablist" aria-label="计划分类" className="flex items-center gap-1 shrink-0">
      {TABS.map((tab) => (
        <button key={tab.id} type="button" role="tab" data-desktop-tab={tab.id}
          id={`desktop-tab-${tab.id}`} aria-selected={active === tab.id}
          aria-controls={`desktop-panel-${tab.id}`} tabIndex={active === tab.id ? 0 : -1}
          onClick={() => onActiveChange(tab.id)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const i = TABS.findIndex((t) => t.id === active);
            const next = event.key === 'Home' ? TABS[0].id
              : event.key === 'End' ? TABS[TABS.length - 1].id
              : TABS[(i + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length].id;
            onActiveChange(next);
            requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-desktop-tab="${next}"]`)?.focus());
          }}
          className={`px-2 py-1 text-sm font-semibold border-b-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${active === tab.id ? 'border-indigo-400 text-white' : 'border-transparent text-white/50 hover:text-white'}`}>
          {tab.label}
        </button>
      ))}
    </div>
  );
  // 窄屏（竖向）：tab 条在上、只显示当前面板；宽屏（横向）：三栏并排、无 tab 条。
  // 日程表/推进表面板自带内部滚动（内容长于面板时），待办 pinned 本身内部滚动。
  const panelCls = (id: WorkspaceTab, scroll: boolean) =>
    `${!wide && active !== id ? 'hidden' : ''} min-h-0 min-w-0 ${wide ? 'h-full' : 'flex-1'} ${scroll ? 'overflow-y-auto' : ''}`;
  return (
    <div data-desktop-workspace data-layout={wide ? 'columns' : 'tabs'}
      className={`flex-1 min-h-0 ${wide ? 'grid grid-cols-3 gap-6' : 'flex flex-col'}`}>
      {!wide && tabs}
      <div id="desktop-panel-task" data-desktop-panel="task"
        role={wide ? undefined : 'tabpanel'} aria-labelledby={!wide ? 'desktop-tab-task' : undefined}
        className={panelCls('task', false)}>
        <TasksSection store={store} pinned />
      </div>
      <div id="desktop-panel-timeline" data-desktop-panel="timeline"
        role={wide ? undefined : 'tabpanel'} aria-labelledby={!wide ? 'desktop-tab-timeline' : undefined}
        className={panelCls('timeline', true)}>
        <TimelineView store={store} />
      </div>
      <div id="desktop-panel-month" data-desktop-panel="month"
        role={wide ? undefined : 'tabpanel'} aria-labelledby={!wide ? 'desktop-tab-month' : undefined}
        className={panelCls('month', true)}>
        <MonthView store={store} />
      </div>
    </div>
  );
}
