import React, { useState } from 'react';
import type { LocalStore } from '../../store/localStore';
import PlanSyncBar from './PlanSyncBar';

/**
 * 悬浮窗便签式卡贴（v2）：窗口 320×440 时只显示这些——
 * 今日未完成待办（可勾选）、添加待办、同步按钮、回完整版按钮。
 * 待办读写与主页计划卡同一份 store（addTask / toggleTask / toggleSubTask），
 * 组内未完成子任务也平铺出来，未完成项以外的一律不显示。
 */
type Row = { key: string; title: string; onToggle: () => void };

function undoneRows(store: LocalStore): Row[] {
  const rows: Row[] = [];
  for (const t of store.data.tasks) {
    if (Array.isArray(t.children)) {
      for (const c of t.children) {
        if (!c.done) {
          rows.push({
            key: `${t.id}:${c.id}`,
            title: c.title,
            onToggle: () => store.toggleSubTask(t.id, c.id),
          });
        }
      }
    } else if (!t.done) {
      rows.push({ key: t.id, title: t.title, onToggle: () => store.toggleTask(t.id) });
    }
  }
  return rows;
}

export default function MiniStickyNote({
  store,
  onExpand,
}: {
  store: LocalStore;
  onExpand: () => void;
}) {
  const [draft, setDraft] = useState('');
  const rows = undoneRows(store);

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    store.addTask(t);
    setDraft('');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 px-3 py-2.5 gap-2.5">
      <div className="flex items-center justify-between shrink-0">
        <span className="text-sm font-medium text-white/90">今日待办 · {rows.length}</span>
        <button
          type="button"
          onClick={onExpand}
          className="text-xs text-indigo-300 hover:text-indigo-200"
        >
          回完整版
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 pr-1">
        {rows.length === 0 ? (
          <p className="text-xs text-white/40 py-4 text-center">今天没有未完成待办</p>
        ) : (
          rows.map((r) => (
            <label
              key={r.key}
              className="flex items-start gap-2 rounded-lg bg-white/5 hover:bg-white/[0.08] px-2.5 py-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={false}
                onChange={r.onToggle}
                className="mt-0.5 shrink-0 accent-indigo-400"
              />
              <span className="text-[13px] leading-snug text-white/85">{r.title}</span>
            </label>
          ))
        )}
      </div>
      <input
        type="text"
        value={draft}
        placeholder="+ 添加待办，回车确认"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') add();
        }}
        className="shrink-0 w-full bg-white/5 border border-dashed border-white/15 rounded-lg px-2.5 py-2 text-[13px] text-white/85 placeholder:text-white/30 outline-none focus:border-indigo-400/50"
      />
      <div className="shrink-0">
        <PlanSyncBar store={store} variant="mini" />
      </div>
    </div>
  );
}
