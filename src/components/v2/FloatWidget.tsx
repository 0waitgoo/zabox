import React, { useState } from 'react';
import {
  isTaskGroup,
  type LocalStore,
} from '../../store/localStore';
import { safeClose } from './planWindow';
import type { PlanTheme } from '../../plan-app';

/**
 * 悬浮小组件（第 4 轮）：完整版点最小化（—）或窗口缩到一定程度后变成的形态。
 * 只放最要紧的：今日未完成待办（普通待办 + 组内子任务摊平）+ 添加待办 + 回完整版。
 * 标题行可拖（logo / 空白带），同步与设置回完整版再用。
 */
export default function FloatWidget({
  store,
  theme,
  onExpand,
}: {
  store: LocalStore;
  theme: PlanTheme;
  onExpand: () => void;
}) {
  const [draft, setDraft] = useState('');
  const light = theme === 'light';

  type Row = { key: string; label: string; group?: string; onToggle: () => void };
  const rows: Row[] = [];
  for (const t of store.data.tasks) {
    if (isTaskGroup(t)) {
      for (const c of t.children ?? []) {
        if (!c.done) {
          rows.push({
            key: `${t.id}-${c.id}`,
            label: c.title,
            group: t.title,
            onToggle: () => store.toggleSubTask(t.id, c.id),
          });
        }
      }
    } else if (!t.done) {
      rows.push({ key: t.id, label: t.title, onToggle: () => store.toggleTask(t.id) });
    }
  }

  const submit = () => {
    const v = draft.trim();
    if (!v) return;
    store.addTask(v);
    setDraft('');
  };

  const btnBase = light
    ? 'shrink-0 flex items-center justify-center rounded-md text-zinc-600 hover:bg-black/10 transition-colors'
    : 'shrink-0 flex items-center justify-center rounded-md text-white/70 hover:bg-white/10 transition-colors';
  const closeBase =
    'shrink-0 flex items-center justify-center rounded-md transition-colors w-7 h-7 text-sm hover:bg-red-500/80 hover:text-white';
  const closeCls = light ? `${closeBase} text-zinc-600` : `${closeBase} text-white/70`;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* 标题行：可拖 + 回完整版 + 关闭 */}
      <div className="h-10 flex items-center gap-2 pl-2.5 pr-1.5 select-none shrink-0">
        <div data-tauri-drag-region className="flex items-center gap-2 shrink-0 min-w-0">
          <img
            src="logo.svg"
            alt=""
            className="w-5 h-5 shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span
            data-tauri-drag-region
            className={`text-sm font-medium truncate ${light ? 'text-zinc-900' : 'text-white/90'}`}
          >
            杂盒计划
          </span>
        </div>
        <div data-tauri-drag-region className="flex-1 min-w-0 h-full" />
        <button
          type="button"
          title="回完整版"
          onClick={onExpand}
          className={`${btnBase} h-7 px-2 text-xs`}
        >
          完整版
        </button>
        <button
          type="button"
          title="关闭"
          onClick={() => void safeClose()}
          className={closeCls}
        >
          ✕
        </button>
      </div>
      {/* 待办清单 */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-1">
        <div className={`text-xs font-medium mb-1.5 ${light ? 'text-zinc-500' : 'text-white/50'}`}>
          今日待办 · {rows.length}
        </div>
        {rows.length === 0 ? (
          <p className={`text-xs ${light ? 'text-zinc-400' : 'text-white/35'}`}>
            今天没有未完成待办
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rows.map((r) => (
              <li key={r.key} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={r.onToggle}
                  className="mt-0.5 shrink-0 accent-indigo-400"
                  aria-label={r.label}
                />
                <span
                  className={`text-[13px] leading-5 min-w-0 break-words ${
                    light ? 'text-zinc-800' : 'text-white/90'
                  }`}
                >
                  {r.group ? (
                    <>
                      <span className={light ? 'text-zinc-400' : 'text-white/40'}>{r.group} · </span>
                      {r.label}
                    </>
                  ) : (
                    r.label
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {/* 添加待办 */}
      <div className="shrink-0 px-3 pb-3 pt-1">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder="+ 添加待办，回车确认"
          className={`w-full rounded-lg border border-dashed px-3 py-2 text-[13px] outline-none ${
            light
              ? 'border-black/20 bg-white/60 text-zinc-900 placeholder:text-zinc-400 focus:border-indigo-400'
              : 'border-white/20 bg-white/5 text-white placeholder:text-white/30 focus:border-indigo-400'
          }`}
        />
      </div>
    </div>
  );
}
