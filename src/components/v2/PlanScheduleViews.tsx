import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useLang } from '../../i18n/useLang';
import {
  formatMonthDay,
  toDateStr,
  type LocalStore,
  type PlanItem,
} from '../../store/localStore';

/**
 * 日程表 / 推进表（2026-10-26 重新设计，用户定）：
 * - 长期计划分类删除：不再有长期计划 tab 与计划行，计划只按跨度分流——
 *   单日计划（开始日 = 结束日）进日程表，多日计划（2 天及以上）进推进表。
 * - 日程表：按日分组的竖向时间线，只显示有计划的日期；每天可建一个或多个；
 *   新建只要标题 + 日期，全天，不问具体时间。
 * - 推进表：只留 month 日历格（Day/Week 分段删除）；多日计划铺满覆盖的每一天
 *   格子底色（半透明状态色），标题只写在区间起点格；单日计划在当天格里显示为
 *   小标记（日程表新建的计划也会出现在月格里）。格子左键点击新建单日，拖过一段
 *   日期新建多日，两种新建都弹出同一个编辑框（标题 + 开始日 + 结束日，实色弹框）。
 * - 旧计划数据：新版首次加载时一次性清空（待办不动），见 localStore.loadInitial。
 */

/** 星期全名 key（getDay() 顺序：0 = 周日），zh 文案自带「星期」前缀，直接渲染 t(key) */
const WEEKDAY_KEYS = ['plan.wdSun', 'plan.wdMon', 'plan.wdTue', 'plan.wdWed', 'plan.wdThu', 'plan.wdFri', 'plan.wdSat'];
/** 月格星期头 key（周一起始，单字） */
const WEEKDAY_HEADER_KEYS = ['plan.wdMonShort', 'plan.wdTueShort', 'plan.wdWedShort', 'plan.wdThuShort', 'plan.wdFriShort', 'plan.wdSatShort', 'plan.wdSunShort'];

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

/** 区间起止：开始日非法时回落结束日；起止颠倒时自动排正序（保存时同口径） */
function spanOf(p: PlanItem): { start: string; end: string } {
  const end = isDateKey(p.deadline) ? p.deadline! : toDateStr(new Date());
  const start = isDateKey(p.startDate) ? p.startDate! : end;
  return start <= end ? { start, end } : { start: end, end: start };
}

/** 只取日期型且截止日合法的计划，按开始日正序 */
function datePlans(plans: PlanItem[]): PlanItem[] {
  return plans
    .filter((p) => p.mode === 'date' && isDateKey(p.deadline))
    .sort((a, b) => spanOf(a).start.localeCompare(spanOf(b).start));
}

/** 单日计划（进日程表）与多日计划（进推进表，2 天及以上） */
function singlePlans(plans: PlanItem[]): PlanItem[] {
  return datePlans(plans).filter((p) => spanOf(p).start === spanOf(p).end);
}
function multiPlans(plans: PlanItem[]): PlanItem[] {
  return datePlans(plans).filter((p) => spanOf(p).start !== spanOf(p).end);
}

type PlanState = 'active' | 'soon' | 'overdue' | 'done';

function planState(p: PlanItem, today: string): PlanState {
  if (p.done) return 'done';
  const left = dayDiff(today, spanOf(p).end);
  if (left < 0) return 'overdue';
  if (left <= 3) return 'soon';
  return 'active';
}

const STATE_LABEL_KEYS: Record<PlanState, string> = {
  active: 'plan.stateActive',
  soon: 'plan.stateSoon',
  overdue: 'plan.stateOverdue',
  done: 'plan.stateDone',
};

const STATE_META: Record<PlanState, { bar: string; tint: string; text: string }> = {
  active: { bar: 'border-indigo-400', tint: 'bg-indigo-500/25', text: 'text-indigo-200' },
  soon: { bar: 'border-amber-400', tint: 'bg-amber-500/25', text: 'text-amber-200' },
  overdue: { bar: 'border-red-400', tint: 'bg-red-500/25', text: 'text-red-200' },
  done: { bar: 'border-emerald-400', tint: 'bg-emerald-500/25', text: 'text-emerald-200' },
};

function rangeLabel(p: PlanItem): string {
  const { start, end } = spanOf(p);
  return start === end ? formatMonthDay(end) : `${formatMonthDay(start)}–${formatMonthDay(end)}`;
}

/* ================= 计划编辑框：标题 + 开始日 + 结束日（单日/多日共用） ================= */

function PlanRangeEditor({
  store,
  plan,
  initialStart,
  initialEnd,
  singleDay,
  onClose,
}: {
  store: LocalStore;
  plan?: PlanItem;
  initialStart: string;
  initialEnd: string;
  /** 单日模式（日程表新建）：只显示一个日期，结束日 = 开始日 */
  singleDay?: boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(plan?.title ?? '');
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const { t } = useLang();
  // 起止颠倒时显示与保存都按正序算，不报错、不拦保存；
  // 单日模式（日程表新建）：结束日恒等于开始日，不跟初始结束日走
  const rawS = start <= end ? start : end;
  const rawE = start <= end ? end : start;
  const s = singleDay ? start : rawS;
  const e = singleDay ? start : rawE;
  const isSingle = singleDay || s === e;

  const submit = () => {
    const t = title.trim();
    if (!t || !isDateKey(s) || !isDateKey(e)) return;
    if (plan) {
      // 编辑：起止日 + 标题；旧的时间/事件日字段一并清掉（新模型不再用时间）
      store.updatePlan(plan.id, { title: t, deadline: e, startDate: s, startTime: '', endTime: '', eventDate: '' });
    } else {
      store.addPlan(t, { mode: 'date', deadline: e, startDate: s });
    }
    onClose();
  };

  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.03] p-3" data-plan-range-editor>
      <input
        value={title}
        autoFocus
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('plan.editorPlaceholder')}
        data-plan-range-title
        className="w-full min-w-0 bg-white/5 border border-white/12 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400/50 placeholder:text-zinc-400"
      />
      <div className="mt-2 flex items-center gap-2">
        <label className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[11px] text-zinc-300 shrink-0">{singleDay ? t('plan.dateLabel') : t('plan.startDate')}</span>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            data-plan-range-start
            className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-xl px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400/50 [color-scheme:dark]"
          />
        </label>
        {!singleDay && (
          <label className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-[11px] text-zinc-300 shrink-0">{t('plan.endDate')}</span>
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              data-plan-range-end
              className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-xl px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400/50 [color-scheme:dark]"
            />
          </label>
        )}
      </div>
      <p className="mt-2 text-[11px] text-zinc-400">
        {isSingle ? t('plan.singleNote') : t('plan.multiNote')}
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!title.trim()}
          data-plan-range-save
          className="px-3.5 py-1.5 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
        >
          {plan ? t('plan.save') : t('plan.addPlan')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-3.5 py-1.5 rounded-lg bg-white/8 text-white/70 text-xs hover:bg-white/12 transition-colors"
        >
          {t('task.cancel')}
        </button>
      </div>
    </div>
  );
}

/* ================= 块详情：范围 + 状态 + 多日进度（编辑复用同一个编辑框） ================= */

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
  const { t } = useLang();
  const st = planState(plan, today);
  const meta = STATE_META[st];
  const { start, end } = spanOf(plan);
  const multi = start !== end;
  // 多日进度：开始日→结束日已流逝比例（与旧计划行同口径）；单日不画进度条
  const total = Math.max(1, dayDiff(start, end));
  const elapsed = Math.min(Math.max(0, dayDiff(start, today)), total);
  const ratio = plan.done ? 1 : elapsed / total;

  return (
    <div data-plan-detail className="rounded-2xl border border-indigo-300/25 bg-indigo-500/[0.07] p-3 mb-3 shrink-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white/90 break-words">{plan.title}</p>
          <p className="mt-1 text-[11px] text-zinc-300">
            {rangeLabel(plan)} · <span className={meta.text}>{t(STATE_LABEL_KEYS[st])}</span>
          </p>
          {multi && (
            <div className="mt-2 h-1 rounded-full bg-white/20 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${st === 'overdue' ? 'bg-red-400' : 'bg-indigo-400'}`}
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label={t('plan.closeDetail')}
          onClick={onClose}
          className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-zinc-200 flex items-center justify-center shrink-0 transition-colors"
        >
          <X size={12} />
        </button>
      </div>
      {editing ? (
        <div className="mt-3">
          <PlanRangeEditor
            store={store}
            plan={plan}
            initialStart={start}
            initialEnd={end}
            onClose={() => setEditing(false)}
          />
        </div>
      ) : (
        <div className="mt-2.5 flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => store.setPlanDone(plan.id, !plan.done)}
            className="px-3 py-1.5 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
          >
            {plan.done ? t('task.unmarkDone') : t('task.markDone')}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/85 text-xs transition-colors"
          >
            {t('task.edit')}
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
                {t('task.confirmDelete')}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/85 text-xs transition-colors"
              >
                {t('task.neverMind')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/85 text-xs transition-colors"
            >
              {t('task.delete')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ================= 日程表：只显示单日计划，按日分组 ================= */

export function TimelineView({ store }: { store: LocalStore }) {
  const today = toDateStr(new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { t } = useLang();
  const plans = singlePlans(store.data.plans);
  const selected = plans.find((p) => p.id === selectedId) ?? null;

  // 按单日分组，正序；没计划的日期天然不存在，不占位
  const groups = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const p of plans) {
      const key = spanOf(p).end;
      const arr = map.get(key) ?? [];
      arr.push(p);
      map.set(key, arr);
    }
    return [...map.entries()].sort((a, b) => parseDay(a[0]).getTime() - parseDay(b[0]).getTime());
  }, [plans]);

  return (
    <div data-schedule-view="timeline" className="flex flex-col min-h-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] text-zinc-400">{t('plan.timelineHint')}</p>
        <button
          type="button"
          data-timeline-new
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 text-white text-xs font-medium transition-colors shrink-0"
        >
          <Plus size={12} /> {t('plan.newPlan')}
        </button>
      </div>

      {showCreate && (
        <div className="mb-3">
          <PlanRangeEditor
            store={store}
            initialStart={today}
            initialEnd={today}
            singleDay
            onClose={() => setShowCreate(false)}
          />
        </div>
      )}

      {selected && (
        <PlanDetail plan={selected} store={store} today={today} onClose={() => setSelectedId(null)} />
      )}

      {groups.length === 0 ? (
        <p className="text-[13px] text-zinc-300 py-6 text-center">{t('plan.timelineEmpty')}</p>
      ) : (
        <div className="flex flex-col">
          {groups.map(([key, dayPlans]) => (
            <div key={key} className="flex gap-3">
              {/* 左侧：大号日期 + 星期 */}
              <div className="w-12 shrink-0 text-center pt-1">
                <p className={`text-xl font-semibold tabular-nums leading-none ${key === today ? 'text-indigo-200' : 'text-white/90'}`}>
                  {parseDay(key).getDate()}
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">
                  {t(WEEKDAY_KEYS[parseDay(key).getDay()])}
                  {key === today && <span className="block text-indigo-200 mt-0.5">{t('plan.today')}</span>}
                </p>
              </div>
              {/* 竖线 + 圆点 */}
              <div className="flex flex-col items-center">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                <div className="w-px flex-1 bg-white/15" />
              </div>
              {/* 当天计划卡 */}
              <div className="flex-1 min-w-0 flex flex-col gap-2 pb-4">
                {dayPlans.map((p) => {
                  const st = planState(p, today);
                  const meta = STATE_META[st];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-timeline-card={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`rounded-2xl border border-white/20 bg-white/10 px-3 py-2.5 text-left hover:bg-white/[0.16] transition-colors border-l-4 ${meta.bar}`}
                    >
                      <p className="text-sm font-medium text-white/90 break-words">{p.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-300">
                        {t('plan.allDay')} · <span className={meta.text}>{t(STATE_LABEL_KEYS[st])}</span>
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

/* ================= 推进表：只留 month 日历格（Day/Week 分段删除） ================= */

export function MonthView({ store }: { store: LocalStore }) {
  const today = toDateStr(new Date());
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });
  const { t } = useLang();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 新建弹框：null = 关闭，否则为预填的起止日（点击格子 = 单日，拖拉 = 区间）
  const [editor, setEditor] = useState<{ start: string; end: string } | null>(null);
  // 拖拉选段：pointerdown 的格子起，pointerenter 经过的格子止；松手才开弹框
  const [drag, setDrag] = useState<{ start: string; end: string } | null>(null);
  const draggingRef = useRef(false);
  // 拖止格子同步记 ref：松手那刻 state 未必已提交，收尾以 ref 为准，避免最后进的格子被吞掉
  const dragEndRef = useRef<string | null>(null);
  // 最近一次格子指针类型：鼠标走 pointerdown→pointerup 拖选；触屏/触控笔走 click（点按才新建，
  // 滑动不触发，避免滚动中途误弹编辑框）
  const pointerTypeRef = useRef('');

  const days = useMemo(() => monthDays(ym.y, ym.m), [ym]);
  const multi = multiPlans(store.data.plans);
  const single = singlePlans(store.data.plans);
  const all = datePlans(store.data.plans);
  const selected = all.find((p) => p.id === selectedId) ?? null;

  // 拖拉松手：window 上收尾（指针滑出格子也能收尾）；点击格子（起止同一天）= 新建单日
  useEffect(() => {
    if (!drag) return;
    const finish = () => {
      draggingRef.current = false;
      const endKey = dragEndRef.current ?? drag.end;
      const s = drag.start <= endKey ? drag.start : endKey;
      const e = drag.start <= endKey ? endKey : drag.start;
      dragEndRef.current = null;
      setDrag(null);
      setEditor({ start: s, end: e });
    };
    window.addEventListener('pointerup', finish);
    return () => window.removeEventListener('pointerup', finish);
  }, [drag]);

  const inDragRange = (key: string) => {
    if (!drag) return false;
    const s = drag.start <= drag.end ? drag.start : drag.end;
    const e = drag.start <= drag.end ? drag.end : drag.start;
    return key >= s && key <= e;
  };

  const shiftMonth = (delta: number) => {
    setYm(({ y, m }) => {
      const d = new Date(y, m - 1 + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() + 1 };
    });
  };

  return (
    <div data-schedule-view="month" className="flex flex-col min-h-0 @container">
      {/* 月份导航：上一月 / 今天 / 下一月 */}
      <div className="flex items-center gap-1.5 mb-2">
        <button
          type="button"
          aria-label={t('plan.prevMonth')}
          onClick={() => shiftMonth(-1)}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/[0.18] text-zinc-200 flex items-center justify-center transition-colors shrink-0"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            const d = new Date();
            setYm({ y: d.getFullYear(), m: d.getMonth() + 1 });
          }}
          className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/[0.18] text-white/85 text-xs font-medium transition-colors shrink-0"
        >
          {t('plan.today')}
        </button>
        <button
          type="button"
          aria-label={t('plan.nextMonth')}
          onClick={() => shiftMonth(1)}
          className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/[0.18] text-zinc-200 flex items-center justify-center transition-colors shrink-0"
        >
          <ChevronRight size={14} />
        </button>
        <span data-month-label className="text-xs text-zinc-300 tabular-nums ml-1">
          {t('plan.monthLabel', { y: ym.y, m: ym.m })}
        </span>
      </div>

      {selected && (
        <PlanDetail plan={selected} store={store} today={today} onClose={() => setSelectedId(null)} />
      )}

      {all.length === 0 && (
        <p className="text-[13px] text-zinc-300 py-2 text-center">
          {t('plan.monthEmpty')}
        </p>
      )}

      {/* 月格：格子左键点 = 新建单日，拖过一段 = 新建多日区间（弹框编辑）；
          多日区间铺满覆盖格的底色（半透明），标题只在起点格，点标题是看详情；
          格子其余位置点按/拖选仍是新建；单日小标记点开也是详情；
          touch 上下滑动仍可滚动卡片（touch-pan-y），拖选主要面向鼠标。
          窄容器（卡面 1x / 手机，< 472px）时格子不再挤成竖条：星期头隐藏，格子
          改成固定正方形、排不下自动往后排（flex-wrap），宽容器仍是 7 列周对齐 */}
      <div data-month-weekdays className="grid grid-cols-7 gap-1 @max-[471px]:hidden">
        {WEEKDAY_HEADER_KEYS.map((k) => (
          <div key={k} className="text-center text-[11px] text-zinc-400 py-1">
            {t(k)}
          </div>
        ))}
      </div>
      <div
        data-month-grid
        className="grid grid-cols-7 gap-1 touch-pan-y @max-[471px]:flex @max-[471px]:flex-wrap"
        data-nodrag
      >
        {days.map((key) => {
          const inMonth = parseDay(key).getMonth() === ym.m - 1;
          const dayMulti = multi.filter((p) => {
            const { start, end } = spanOf(p);
            return key >= start && key <= end;
          });
          const daySingle = single.filter((p) => spanOf(p).end === key);
          const highlighted = inDragRange(key);
          // 区间底色：取覆盖本格的第一个区间（按开始日排），多区间同格时底色只显示第一个，
          // 各区间标题仍在各自起点格单独列出
          const coverMeta = dayMulti.length > 0 ? STATE_META[planState(dayMulti[0], today)] : null;
          const bg = coverMeta
            ? coverMeta.tint
            : highlighted
              ? 'bg-indigo-500/[0.16]'
              : key === today
                ? 'bg-indigo-500/[0.08]'
                : 'bg-white/[0.03]';
          return (
            <div
              key={key}
              data-month-cell={key}
              data-month-cover={dayMulti.map((p) => p.id).join(' ') || undefined}
              onPointerDown={(e) => {
                // 点在已有计划的色块/标记上 = 看详情，不开始拖选
                if ((e.target as HTMLElement).closest('button')) return;
                pointerTypeRef.current = e.pointerType;
                if (e.pointerType !== 'mouse') return; // 触屏/触控笔不拖选，点按走 onClick
                draggingRef.current = true;
                dragEndRef.current = key;
                setDrag({ start: key, end: key });
              }}
              onClick={(e) => {
                // 鼠标已由 pointerup 收尾开过弹框，这里只处理触屏/触控笔的点按新建
                if ((e.target as HTMLElement).closest('button')) return;
                if (pointerTypeRef.current === 'mouse') return;
                setEditor({ start: key, end: key });
              }}
              onPointerEnter={() => {
                if (draggingRef.current) {
                  dragEndRef.current = key;
                  setDrag((d) => (d ? { ...d, end: key } : d));
                }
              }}
              className={`rounded-xl border px-1.5 py-1 min-h-[64px] cursor-pointer transition-colors @max-[471px]:w-12 @max-[471px]:shrink-0 @max-[471px]:aspect-square @max-[471px]:min-h-0 @max-[471px]:p-1 @max-[471px]:overflow-hidden ${
                key === today ? 'border-indigo-400/50' : 'border-white/10'
              } ${highlighted ? 'ring-2 ring-indigo-400/70' : ''} ${bg} ${inMonth ? '' : 'opacity-40'}`}
            >
              <p className={`text-[11px] tabular-nums ${key === today ? 'text-indigo-200 font-medium' : 'text-zinc-300'}`}>
                {parseDay(key).getDate()}
                {key === today && <span className="ml-1 text-[10px] px-1 py-0.5 rounded bg-indigo-500/70 text-white align-middle @max-[471px]:hidden">{t('plan.today')}</span>}
              </p>
              <div className="mt-1 flex flex-col gap-1 @max-[471px]:mt-0.5 @max-[471px]:gap-0">
                {/* 多日区间标题：只写在区间起点格（区间从上月开始时，写在本月第一格）；
                    底色已由格子本身铺满，这里不再画一条色块 */}
                {dayMulti.map((p) => {
                  const { start } = spanOf(p);
                  const showTitle = key === start || (start < days[0] && key === days[0]);
                  if (!showTitle) return null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-month-segment={`${p.id}:${key}`}
                      title={p.title}
                      onClick={() => setSelectedId(p.id)}
                      className="text-left text-[11px] leading-5 text-white/90 truncate hover:underline px-0.5"
                    >
                      {p.title}
                    </button>
                  );
                })}
                {/* 单日计划：当天格里的小标记（日程表新建的计划也会出现在这里） */}
                {daySingle.map((p) => {
                  const st = planState(p, today);
                  const meta = STATE_META[st];
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-month-marker={p.id}
                      title={p.title}
                      onClick={() => setSelectedId(p.id)}
                      className={`rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[11px] text-white/85 truncate text-left hover:bg-white/[0.16] transition-colors border-l-2 ${meta.bar}`}
                    >
                      {p.title}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* 新建弹框：点击格子 / 拖拉选段后弹出，标题 + 开始日 + 结束日；
          弹框用实色面板（组合选择器/分组面板同款），不再透出底下卡片 */}
      {editor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setEditor(null)}
        >
          <div
            className="w-full max-w-sm rounded-[28px] bg-[#17171d] border border-white/15 p-4 shadow-2xl shadow-black/70"
            onClick={(e) => e.stopPropagation()}
            data-month-editor
          >
            <PlanRangeEditor
              store={store}
              initialStart={editor.start}
              initialEnd={editor.end}
              onClose={() => setEditor(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
