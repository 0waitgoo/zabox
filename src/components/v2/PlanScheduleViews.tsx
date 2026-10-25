import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import {
  formatMonthDay,
  toDateStr,
  type LocalStore,
  type PlanItem,
} from '../../store/localStore';
import { PlanEditForm } from './TaskSections';

/**
 * 计划新视图（本轮新增，与 2x 计划卡的「计划 | 日程表 | 推进表」tab 配合）：
 * - 数据只读现有 plans：只有日期型计划（有 deadline）才进表；没日期的待办/次数型计划
 *   只留在「计划」视图，绝不为填表编日期。
 * - 视觉不另起一套：块与卡片沿用计划行同一套 token（白字/淡边/靛蓝主色），状态只用
 *   左侧色条区分（进行中靛蓝 / 3 天内到期琥珀 / 已逾期红 / 已完成绿）。
 * - 时间是可选字段：日期型计划可填开始/结束时间（HH:MM），有时间才落时间轴，没填
 *   的一律进全天区；数据里没有「个人/小组」类型字段，块上标的是计划状态，不编类型。
 */

const WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
const ROW_H = 44; // 时间轴一小时行高（px）
const TIME_LABEL_COL = 44;

function isDateKey(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function parseDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(key: string, n: number): string {
  const d = parseDay(key);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function dayDiff(a: string, b: string): number {
  return Math.round((parseDay(b).getTime() - parseDay(a).getTime()) / 86400000);
}

/** 周一起始：返回 key 所在周的周一 */
function weekStart(key: string): string {
  const d = parseDay(key);
  const dow = (d.getDay() + 6) % 7; // 周一=0
  d.setDate(d.getDate() - dow);
  return toDateStr(d);
}

function monthDays(year: number, month: number): string[] {
  // 返回覆盖该月的日历格（周一起始，整周补齐）
  const first = new Date(year, month - 1, 1);
  const start = weekStart(toDateStr(first));
  const days: string[] = [];
  let cur = start;
  for (let i = 0; i < 42; i++) {
    days.push(cur);
    cur = addDays(cur, 1);
    if (i >= 27 && parseDay(cur).getMonth() !== month - 1 && parseDay(cur).getDay() === 1) break;
  }
  return days;
}

function minutesOf(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function isTimed(p: PlanItem): boolean {
  return typeof p.startTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.startTime);
}

/** 只取日期型且 deadline 合法的计划，按截止日正序、开始时间排 */
function datedPlans(plans: PlanItem[]): PlanItem[] {
  return plans
    .filter((p) => p.mode === 'date' && isDateKey(p.deadline))
    .sort((a, b) => {
      const d = parseDay(a.deadline!).getTime() - parseDay(b.deadline!).getTime();
      if (d !== 0) return d;
      return (a.startTime ?? '') < (b.startTime ?? '') ? -1 : 1;
    });
}

type PlanState = 'active' | 'soon' | 'overdue' | 'done';

function planState(p: PlanItem, today: string): PlanState {
  if (p.done) return 'done';
  const left = dayDiff(today, p.deadline!);
  if (left < 0) return 'overdue';
  if (left <= 3) return 'soon';
  return 'active';
}

const STATE_META: Record<PlanState, { label: string; bar: string; text: string }> = {
  active: { label: '进行中', bar: 'border-indigo-400', text: 'text-indigo-200' },
  soon: { label: '即将到期', bar: 'border-amber-400', text: 'text-amber-200' },
  overdue: { label: '已逾期', bar: 'border-red-400', text: 'text-red-200' },
  done: { label: '已完成', bar: 'border-emerald-400', text: 'text-emerald-200' },
};

function timeLabel(p: PlanItem): string {
  if (!isTimed(p)) return '全天';
  return p.endTime ? `${p.startTime}–${p.endTime}` : `${p.startTime}起`;
}

function rangeLabel(p: PlanItem): string {
  if (p.startDate && p.startDate !== p.deadline) {
    return `${formatMonthDay(p.startDate)}–${formatMonthDay(p.deadline!)}`;
  }
  return formatMonthDay(p.deadline!);
}

/** 块详情：复用 store 方法（完成/删除）与现有编辑表单，不另起编辑 UI */
function PlanDetail({
  plan,
  store,
  today,
  onClose,
}: {
  plan: PlanItem;
  store: LocalStore;
  today: string;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const st = planState(plan, today);
  const meta = STATE_META[st];
  // 日期型进度：startDate→deadline 已流逝比例（与计划行同口径）
  const total = plan.startDate && plan.deadline ? Math.max(1, dayDiff(plan.startDate, plan.deadline)) : 1;
  const elapsed = plan.startDate ? Math.min(Math.max(0, dayDiff(plan.startDate, today)), total) : 0;
  const ratio = plan.done ? 1 : elapsed / total;

  return (
    <div data-plan-detail className="rounded-2xl border border-indigo-300/25 bg-indigo-500/[0.07] p-3 mb-3 shrink-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/90 break-words">{plan.title}</p>
          <p className="mt-1 text-[11px] text-zinc-300">
            {rangeLabel(plan)} · {timeLabel(plan)} · <span className={meta.text}>{meta.label}</span>
          </p>
          <div className="mt-2 h-1 rounded-full bg-white/20 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${st === 'overdue' ? 'bg-red-400' : 'bg-indigo-400'}`}
              style={{ width: `${Math.round(ratio * 100)}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭详情"
          onClick={onClose}
          className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 flex items-center justify-center shrink-0 transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      {editing ? (
        <div className="mt-3">
          <PlanEditForm plan={plan} store={store} onClose={() => setEditing(false)} />
        </div>
      ) : (
        <div className="mt-2.5 flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => store.setPlanDone(plan.id, !plan.done)}
            className="px-3 py-1.5 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
          >
            {plan.done ? '取消完成' : '标记完成'}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/85 text-xs transition-colors"
          >
            编辑
          </button>
          {confirmDelete ? (
            <>
              <button
                type="button"
                onClick={() => {
                  store.deletePlan(plan.id);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-xs font-medium transition-colors"
              >
                确认删除
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/85 text-xs transition-colors"
              >
                算了
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 text-white/85 text-xs transition-colors"
            >
              删除
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const NAV_BTN =
  'w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-100 flex items-center justify-center shrink-0 transition-colors';
const SEG_BTN = (active: boolean) =>
  `px-2.5 py-1 rounded-lg text-xs transition-colors ${active ? 'bg-indigo-500/80 text-white font-medium' : 'text-white/55 hover:text-white/85'}`;

/* ================= 推进表：Day / Week / Month ================= */

export function WeekGridView({ store }: { store: LocalStore }) {
  const today = toDateStr(new Date());
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(today);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const plans = datedPlans(store.data.plans);
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  const days: string[] = useMemo(() => {
    if (mode === 'day') return [anchor];
    if (mode === 'week') {
      const start = weekStart(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const d = parseDay(anchor);
    return monthDays(d.getFullYear(), d.getMonth() + 1);
  }, [mode, anchor]);

  const periodLabel =
    mode === 'day'
      ? `${formatMonthDay(anchor)} 星期${WEEKDAY[parseDay(anchor).getDay()]}`
      : mode === 'week'
        ? `${formatMonthDay(days[0])}–${formatMonthDay(days[days.length - 1])}`
        : `${parseDay(anchor).getFullYear()}年${parseDay(anchor).getMonth() + 1}月`;

  const step = (dir: 1 | -1) => {
    if (mode === 'day') setAnchor(addDays(anchor, dir));
    else if (mode === 'week') setAnchor(addDays(anchor, dir * 7));
    else {
      const d = parseDay(anchor);
      setAnchor(toDateStr(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    }
  };

  // 全天区：跨天计划（startDate→deadline）按区间分 lane 排布，避免重叠压在一起
  const allDayLanes = useMemo(() => {
    const items = plans.filter((p) => !isTimed(p));
    const lanes: { plan: PlanItem; start: number; end: number }[][] = [];
    for (const p of items) {
      const s = p.startDate && isDateKey(p.startDate) ? p.startDate : p.deadline!;
      const e = p.deadline!;
      const si = days.indexOf(s);
      const ei = days.indexOf(e);
      if (ei < 0 && si < 0) continue; // 本期外不画（跨期只画可见部分）
      const vs = Math.max(0, si < 0 ? 0 : si);
      const ve = ei < 0 ? days.length - 1 : ei;
      if (ve < vs) continue;
      let lane = lanes.find((l) => l.every((it) => it.end < vs || it.start > ve));
      if (!lane) {
        lane = [];
        lanes.push(lane);
      }
      lane.push({ plan: p, start: vs, end: ve });
    }
    return lanes;
  }, [plans, days]);

  const timedByDay = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const p of plans.filter(isTimed)) {
      const arr = map.get(p.deadline!) ?? [];
      arr.push(p);
      map.set(p.deadline!, arr);
    }
    return map;
  }, [plans]);

  const blockCls = (p: PlanItem) =>
    `rounded-lg border border-white/20 bg-white/10 px-2 py-1.5 cursor-pointer hover:bg-white/[0.16] transition-colors border-l-4 ${STATE_META[planState(p, today)].bar}`;

  return (
    <div data-schedule-view="week" className="flex flex-col min-h-0">
      {/* 顶部：模式切换 + Today + 前后翻 */}
      <div className="flex items-center gap-2 flex-wrap shrink-0 mb-2">
        <div className="flex gap-0.5 p-0.5 rounded-xl bg-white/5 border border-white/10">
          {(['day', 'week', 'month'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={SEG_BTN(mode === m)}>
              {m === 'day' ? 'Day' : m === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setAnchor(today)} className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-white/85 transition-colors shrink-0">
          Today
        </button>
        <button type="button" aria-label="上一期" onClick={() => step(-1)} className={NAV_BTN}>
          <ChevronLeft size={14} />
        </button>
        <button type="button" aria-label="下一期" onClick={() => step(1)} className={NAV_BTN}>
          <ChevronRight size={14} />
        </button>
        <span className="text-xs text-zinc-300 tabular-nums">{periodLabel}</span>
      </div>

      {selected && (
        <PlanDetail plan={selected} store={store} today={today} onClose={() => setSelectedId(null)} />
      )}

      {plans.length === 0 ? (
        <p className="text-[13px] text-zinc-300 py-6 text-center">
          还没有带日期的长期计划，去「计划」里新建一个按日期的计划，就会出现在这里。
        </p>
      ) : mode === 'month' ? (
        /* 月视图：日历格，只画截止日当天的块；点日期数字跳到该周 */
        <div className="grid grid-cols-7 gap-1" data-month-grid>
          {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
            <div key={w} className="text-center text-[11px] text-zinc-400 py-1">
              {w}
            </div>
          ))}
          {days.map((key) => {
            const inMonth = parseDay(key).getMonth() === parseDay(anchor).getMonth();
            const dayPlans = plans.filter((p) => p.deadline === key);
            return (
              <div
                key={key}
                className={`rounded-xl border px-1.5 py-1 min-h-[64px] ${key === today ? 'border-indigo-400/50 bg-indigo-500/[0.08]' : 'border-white/10 bg-white/[0.03]'} ${inMonth ? '' : 'opacity-40'}`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setAnchor(key);
                    setMode('week');
                  }}
                  className={`text-[11px] tabular-nums ${key === today ? 'text-indigo-200 font-medium' : 'text-zinc-300'}`}
                >
                  {parseDay(key).getDate()}
                </button>
                <div className="mt-1 flex flex-col gap-1">
                  {dayPlans.slice(0, 3).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      data-week-block={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`text-left truncate text-[11px] px-1.5 py-0.5 rounded-md border border-white/15 bg-white/10 text-white/85 border-l-2 ${STATE_META[planState(p, today)].bar}`}
                    >
                      {isTimed(p) ? `${p.startTime} ` : ''}
                      {p.title}
                    </button>
                  ))}
                  {dayPlans.length > 3 && <span className="text-[11px] text-zinc-400 px-1">＋{dayPlans.length - 3}</span>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 日 / 周视图：全天区 + 时间轴（手机端横向滑动看全周） */
        <div className="overflow-x-auto pb-1" data-week-grid>
          <div style={{ minWidth: mode === 'day' ? '100%' : 840 }}>
            {/* 表头：星期 + 日期 */}
            <div className="grid" style={{ gridTemplateColumns: `${TIME_LABEL_COL}px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div />
              {days.map((key) => (
                <div key={key} className="text-center pb-1.5">
                  <p className={`text-[11px] ${key === today ? 'text-indigo-200' : 'text-zinc-400'}`}>
                    星期{WEEKDAY[parseDay(key).getDay()]}
                  </p>
                  <p className={`text-sm tabular-nums ${key === today ? 'text-indigo-200 font-semibold' : 'text-white/85'}`}>
                    {formatMonthDay(key)}
                    {key === today && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-indigo-500/70 text-white align-middle">今天</span>}
                  </p>
                </div>
              ))}
            </div>
            {/* 全天区：跨天条按区间分 lane 排布，避免重叠压在一起；
                grid 自动按列找空行放，未重叠的条会紧凑排布 */}
            <div className="grid" style={{ gridTemplateColumns: `${TIME_LABEL_COL}px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="text-[11px] text-zinc-400 pt-1.5 pr-1">全天</div>
              <div
                className="grid gap-1"
                style={{ gridColumn: `2 / span ${days.length}`, gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}
              >
                {allDayLanes.length === 0 && <p className="text-[11px] text-zinc-500 py-1">本期没有全天计划</p>}
                {allDayLanes.map((lane, li) => (
                  <React.Fragment key={li}>
                    {lane.map(({ plan, start, end }) => (
                      <button
                        key={plan.id}
                        type="button"
                        data-week-block={plan.id}
                        onClick={() => setSelectedId(plan.id)}
                        className={blockCls(plan)}
                        style={{ gridColumn: `${start + 1} / span ${end - start + 1}` }}
                      >
                        <p className="truncate text-xs font-medium text-white/90">{plan.title}</p>
                        <p className="truncate text-[11px] text-zinc-300">
                          {rangeLabel(plan)} · {STATE_META[planState(plan, today)].label}
                        </p>
                      </button>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
            {/* 时间轴：小时行 + 按开始/结束时间落块 */}
            <div className="grid mt-1" style={{ gridTemplateColumns: `${TIME_LABEL_COL}px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="relative" style={{ height: 24 * ROW_H }}>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute left-0 right-0 text-[10px] text-zinc-500 tabular-nums" style={{ top: h * ROW_H }}>
                    {String(h).padStart(2, '0')}:00
                  </div>
                ))}
              </div>
              {days.map((key) => {
                const timed = timedByDay.get(key) ?? [];
                return (
                  <div key={key} className="relative border-l border-white/5" style={{ height: 24 * ROW_H }}>
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="absolute left-0 right-0 border-t border-white/5" style={{ top: h * ROW_H }} />
                    ))}
                    {timed.map((p) => {
                      const startMin = minutesOf(p.startTime!);
                      const endMin = p.endTime ? minutesOf(p.endTime) : startMin + 60;
                      const top = (startMin / 60) * ROW_H;
                      const height = Math.max(24, ((endMin - startMin) / 60) * ROW_H - 2);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          data-week-block={p.id}
                          onClick={() => setSelectedId(p.id)}
                          className={`absolute left-1 right-1 overflow-hidden ${blockCls(p)}`}
                          style={{ top, height }}
                        >
                          <p className="truncate text-xs font-medium text-white/90">{p.title}</p>
                          <p className="truncate text-[11px] text-zinc-300">{timeLabel(p)}</p>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================= 竖向日程表：只显示有计划的日期 ================= */

export function TimelineView({ store, onAddPlan }: { store: LocalStore; onAddPlan: () => void }) {
  const today = toDateStr(new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const plans = datedPlans(store.data.plans);
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  // 按截止日分组，正序；没计划的日期天然不存在，不占位
  const groups = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const p of plans) {
      const arr = map.get(p.deadline!) ?? [];
      arr.push(p);
      map.set(p.deadline!, arr);
    }
    return [...map.entries()].sort((a, b) => parseDay(a[0]).getTime() - parseDay(b[0]).getTime());
  }, [plans]);

  return (
    <div data-schedule-view="timeline" className="flex flex-col min-h-0">
      <div className="flex items-center justify-between shrink-0 mb-3">
        <p className="text-xs text-zinc-400">只显示有计划的日期，没计划的日子直接跳过</p>
        <button
          type="button"
          onClick={onAddPlan}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shrink-0"
        >
          <Plus size={12} /> 新建
        </button>
      </div>

      {selected && (
        <PlanDetail plan={selected} store={store} today={today} onClose={() => setSelectedId(null)} />
      )}

      {groups.length === 0 ? (
        <p className="text-[13px] text-zinc-300 py-6 text-center">
          还没有带日期的长期计划，去「计划」里新建一个按日期的计划，就会出现在这里。
        </p>
      ) : (
        <div className="flex flex-col">
          {groups.map(([key, dayPlans], gi) => (
            <div key={key} className="flex gap-3">
              {/* 左侧：大号日期 + 星期 */}
              <div className="w-12 shrink-0 text-center pt-1">
                <p className={`text-xl font-semibold tabular-nums leading-none ${key === today ? 'text-indigo-200' : 'text-white/90'}`}>
                  {parseDay(key).getDate()}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  星期{WEEKDAY[parseDay(key).getDay()]}
                  {key === today && <span className="block text-indigo-200 mt-0.5">今天</span>}
                </p>
              </div>
              {/* 竖线 + 圆点 */}
              <div className="relative w-4 shrink-0">
                <span className="absolute left-1/2 -translate-x-1/2 top-2 w-2 h-2 rounded-full bg-indigo-400" />
                {gi < groups.length - 1 && (
                  <span className="absolute left-1/2 -translate-x-1/2 top-4 bottom-0 w-px bg-white/15" />
                )}
              </div>
              {/* 右侧：当天事件卡 */}
              <div className="flex-1 min-w-0 flex flex-col gap-2 pb-5">
                {dayPlans.map((p) => {
                  const meta = STATE_META[planState(p, today)];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-timeline-card={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`text-left rounded-2xl border border-white/20 bg-white/10 px-3 py-2.5 hover:bg-white/[0.16] transition-colors border-l-4 ${meta.bar}`}
                    >
                      <p className="text-sm font-medium text-white/90 break-words">{p.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-300">
                        {timeLabel(p)} · {rangeLabel(p)} · <span className={meta.text}>{meta.label}</span>
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
