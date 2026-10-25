import React, { useEffect, useState } from 'react';
import type { LocalStore } from '../../store/localStore';
import { PlansSection, TasksSection } from './TaskSections';
import type { CreateKind } from './DesktopCreateMenu';

/** Use window shape, rather than a device breakpoint, for the desktop layout. */
export default function DesktopPlanWorkspace({ store, active, onActiveChange }: {
  store: LocalStore;
  active: CreateKind;
  onActiveChange: (kind: CreateKind) => void;
}) {
  const [wide, setWide] = useState(() => window.matchMedia('(orientation: landscape)').matches);
  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape)');
    const update = () => setWide(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const tabs = (
    <div role="tablist" aria-label="计划分类" className="flex items-center gap-1">
      {(['task', 'plan'] as const).map((kind) => (
        <button key={kind} type="button" role="tab" data-desktop-tab={kind}
          id={`desktop-tab-${kind}`} aria-selected={active === kind}
          aria-controls={`desktop-panel-${kind}`} tabIndex={active === kind ? 0 : -1}
          onClick={() => onActiveChange(kind)}
          onKeyDown={(event) => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === 'Home' ? 'task' : event.key === 'End' ? 'plan' : active === 'task' ? 'plan' : 'task';
            onActiveChange(next);
            requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-desktop-tab="${next}"]`)?.focus());
          }}
          className={`px-2 py-1 text-sm font-semibold border-b-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${active === kind ? 'border-indigo-400 text-white' : 'border-transparent text-white/50 hover:text-white'}`}>
          {kind === 'task' ? '待办' : '长期计划'}
        </button>
      ))}
    </div>
  );
  return (
    <div data-desktop-workspace data-layout={wide ? 'columns' : 'tabs'}
      className={`flex-1 min-h-0 ${wide ? 'grid grid-cols-2 gap-6' : 'flex flex-col'}`}>
      <div id="desktop-panel-task" data-desktop-panel="task"
        role={wide ? undefined : 'tabpanel'} aria-labelledby={!wide ? 'desktop-tab-task' : undefined}
        className={!wide && active !== 'task' ? 'hidden' : 'min-h-0 min-w-0 h-full'}>
        <TasksSection store={store} pinned heading={!wide && active === 'task' ? tabs : undefined} />
      </div>
      <div id="desktop-panel-plan" data-desktop-panel="plan"
        role={wide ? undefined : 'tabpanel'} aria-labelledby={!wide ? 'desktop-tab-plan' : undefined}
        className={!wide && active !== 'plan' ? 'hidden' : 'min-h-0 min-w-0 h-full'}>
        <PlansSection store={store} pinned heading={!wide && active === 'plan' ? tabs : undefined} />
      </div>
    </div>
  );
}
