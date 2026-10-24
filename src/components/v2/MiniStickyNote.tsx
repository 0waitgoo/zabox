import React, { useState } from 'react';
import type { LocalStore, PlanItem } from '../../store/localStore';
import PlanSyncBar from './PlanSyncBar';

/**
 * 悬浮窗便签式卡贴（v2，便签优化版）：窗口 320×440 时只显示这些——
 * 今日未完成待办（可勾选）、进行中的长期计划（次数型可 +1、日期型看剩余天数）、
 * 添加待办、同步按钮、回完整版按钮。
 * 待办读写与主页计划卡同一份 store（addTask / toggleTask / toggleSubTask），
 * 组内未完成子任务也平铺出来；长期计划与主页计划卡同一份 store.data.plans。
 */
type Row = { key: string; title: string; onToggle: () => void };

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(s?: string): number | null {
  if (!s) return null;
  const t = new Date(`${s}T00:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

/** 长期计划是否已完成：日期型看 done 标记，次数型看 current 是否达标 */
function planFinished(p: PlanItem): boolean {
  if (p.mode === 'date') return p.done === true;
  const target = p.targetCount ?? 0;
  return target > 0 && (p.currentCount ?? 0) >= target;
}

/** 长期计划进度 0~1：次数型 = current/target，日期型 = 已流逝比例 */
function planProgress(p: PlanItem): number {
  if (p.mode === 'date') {
    const end = parseDate(p.deadline);
    if (end === null) return 0;
    const start = parseDate(p.startDate) ?? end;
    const total = end - start;
    if (total <= 0) return 1;
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.min(1, Math.max(0, (now.getTime() - start) / total));
  }
  const target = p.targetCount ?? 0;
  if (target <= 0) return 0;
  return Math.min(1, (p.currentCount ?? 0) / target);
}

/** 日期型剩余天数（负数 = 已超期） */
function remainDays(p: PlanItem): number | null {
  const end = parseDate(p.deadline);
  if (end === null) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((end - now.getTime()) / DAY_MS);
}

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
  const plans = store.data.plans.filter((p) => !planFinished(p));

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    store.addTask(t);
    setDraft('');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 px-3 py-2.5 gap-2.5">
      <div className="flex items-center justify-between shrink-0">
        <span
          data-tauri-drag-region
          className="text-sm font-medium text-white/90"
        >
          今日待办 · {rows.length}
        </span>
        <div data-tauri-drag-region className="flex-1 min-w-0 h-full" />
        <button
          type="button"
          onClick={onExpand}
          className="text-xs text-indigo-300 hover:text-indigo-200 shrink-0"
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
        {plans.length > 0 && (
          <>
            <div className="flex items-center gap-2 pt-2.5 mt-1 border-t border-white/10">
              <span className="text-sm font-medium text-white/90">
                长期计划 · {plans.length}
              </span>
            </div>
            {plans.map((p) => {
              const pct = Math.round(planProgress(p) * 100);
              const remain = p.mode === 'date' ? remainDays(p) : null;
              return (
                <div
                  key={p.id}
                  className="rounded-lg bg-white/5 px-2.5 py-2 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] leading-snug text-white/85 min-w-0 truncate">
                      {p.title}
                    </span>
                    {p.mode === 'count' ? (
                      <button
                        type="button"
                        onClick={() => store.bumpPlanCount(p.id)}
                        className="shrink-0 h-6 px-2 rounded-md bg-indigo-500/80 hover:bg-indigo-400 text-xs text-white"
                      >
                        +1
                      </button>
                    ) : (
                      <span className="shrink-0 text-[11px] text-white/50">
                        {remain === null
                          ? ''
                          : remain > 0
                            ? `剩 ${remain} 天`
                            : remain === 0
                              ? '今天到期'
                              : `超期 ${-remain} 天`}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-indigo-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] text-white/50 tabular-nums">
                      {p.mode === 'count'
                        ? `${p.currentCount ?? 0}/${p.targetCount ?? 0}${p.unit ?? '次'}`
                        : `${pct}%`}
                    </span>
                  </div>
                </div>
              );
            })}
          </>
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
