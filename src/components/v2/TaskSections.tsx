import React, { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, Download, File as FileIcon, Film, FolderOpen, Image as ImageIcon, ImagePlus, Layers, Minus, Music, Paperclip, Pencil, Plus, SendHorizontal, Sparkles, Table, Trash2, Ungroup, X } from 'lucide-react';
import {
  dateStrDiffDays,
  formatMonthDay,
  isTaskGroup,
  planCountRatio,
  planDateRatio,
  taskChildProgress,
  taskEntryDone,
  taskGroupDone,
  todayDateStr,
  type LocalStore,
  type NoteAttachmentItem,
  type PlanItem,
  type TaskChild,
  type TaskItem,
  type TaskNoteMsg,
  type TaskNoteMsgInput,
  type TaskNoteMsgPatch,
} from '../../store/localStore';
import { deleteNoteImage, loadNoteImage, saveNoteImage } from '../../store/noteImageDb';
import {
  deleteNoteRemoteFile,
  fetchNoteRemoteBlob,
  getActiveNoteSync,
  noteLimitsFor,
  noteTotalLimitLabel,
  uploadNoteFile,
} from '../../store/noteRemote';
import { splitTasksText } from '../../utils/taskSplit';
import { useLang } from '../../i18n/useLang';

/** 标题三行收起：超 3 行自动收起并在后面显示展开/收起按钮（只在确实超行时显示）；双击标题直接编辑（调用方传 onDoubleClick） */
function ExpandableTitle({
  text,
  expanded,
  onToggle,
  onDoubleClick,
  onOpenNote,
  titleAttr,
  sizeClass,
  toneClass,
  spanData,
}: {
  text: string;
  expanded: boolean;
  onToggle: () => void;
  onDoubleClick?: () => void;
  /** 点标题开笔记（2026-11-20）：传了就代替点击展开；展开仍走下面的展开/收起按钮 */
  onOpenNote?: () => void;
  titleAttr: string;
  sizeClass: string;
  toneClass: string;
  spanData: { 'data-task-title'?: string; 'data-subtask-title'?: string; 'data-group-title'?: string };
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [overflow, setOverflow] = useState(false);
  const { t } = useLang();
  useLayoutEffect(() => {
    if (expanded) return;
    const el = ref.current;
    if (el) setOverflow(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);
  return (
    <div className="flex-1 min-w-0">
      <span
        ref={ref}
        {...spanData}
        onClick={onOpenNote ?? onToggle}
        onDoubleClick={onDoubleClick}
        title={titleAttr}
        style={expanded ? { WebkitLineClamp: 'unset' } : undefined}
        className={`min-w-0 ${sizeClass} line-clamp-3 break-words ${toneClass}`}
      >
        {text}
      </span>
      {overflow && (
        <button
          type="button"
          onClick={onToggle}
          className="mt-0.5 text-xs text-indigo-300 hover:text-indigo-200"
        >
          {expanded ? t('task.collapse') : t('task.expand')}
        </button>
      )}
    </div>
  );
}

/**
 * 计划任务内容区（原 TaskPanel.tsx；第六十九轮起展开面板取消，本文件只剩内容组件，由 2x 计划卡卡面直接承载）：
 * 待办列 TasksSection / AI 整理视图 AiView。
 * 历史沿革（第十八轮起，本文件前身为计划任务面板）：
 * - 主视图：待办可勾选/添加，已完成折叠；待办可建「组」——子任务可勾，
 *   组本身不单独勾选，完成态由子任务全勾推导；组计数在头部按子任务摊平（与卡面同一口径）
 * - 行操作走右键菜单（范式同 SiteContextMenu）：编辑 / 删除（菜单内两步确认）；子任务右键只有删除
 * - 头部「AI 整理」切换到整理视图：一句话杂事 → 本地规则拆分预览（可勾选、可改字）→ 确认落库
 *   AI 只做拆分归类，不改动已有事项；拆分实现见 utils/taskSplit.ts（可替换为真 AI）
 * - 2026-10-26 长期计划分类删除（用户定）：PlansSection / 计划行 / 新建与编辑表单整段删除，
 *   计划只剩日程表（单日）与推进表（多日区间），见 PlanScheduleViews.tsx；AI 整理拆出的
 *   长期事项直接并入待办，不再单独立项
 * - 第五十二轮（只动配色，功能/结构不动）：计划条目浮起（bg-white/10 + border-white/20）、
 *   进度轨道 white/20、计数提到 zinc-200、−/+ 钮做实（white/10 底）、待办区次级文字统一 zinc-300 档、
 *   复选框边框 white/50、输入 placeholder zinc-400；本节区与 TaskCard 共用，卡面同步生效
 * - 第五十四轮：待办拖拽合并成组——在「未完成」列表里按住顶层待办行身（控件除外）拖动、
 *   压到另一条顶层待办上松手即合并（手势与反馈沿用 useSiteDragSort 的两段式指针拖拽，
 *   落盘走 store.mergeTaskIntoGroup）；已完成区条目不参与，手动建组入口不变
 * - 第五十七轮：① 修「加了子任务还显示组里还没有子任务」——空提示条件本身没错（与子任务行
 *   同源于 group.children），病在添加路径只靠表单隐式提交：中文输入法组合态下按回车只上屏、
 *   不触发提交，文字留在框里、组仍为空。子任务/添加待办/组名三个输入框改由 keydown 显式提交
 *   （组合中的回车忽略、提交后草稿同步清零防同键重复），标题编辑框的回车同样加组合守卫；
 *   ② 拖拽合并改口径：普通 × 普通改为新建自动命名组「小组N」（语义见 store.mergeTaskIntoGroup）
 * - 第六十九轮：展开面板（TaskPanel）取消——「展开」按钮与面板这一层删除，全部操作回到卡面：
 *   建组入口、新建计划表单不再区分 variant，卡面（唯一的承载方）全功能；AI 整理改为卡面头部
 *   按钮切换卡内视图（AiView 仍在本文件）；待办/组/子任务的截断标题改为点击文字展开全文、
 *   再点收起（勾选框不触发，编辑仍走右键菜单；合并拖拽刚结束的那次点击由 wasJustDragged 守卫吞掉）
 * - 第七十五轮：① 行内编辑「点外面 = 确认」——添加待办/子任务框失焦即提交（空草稿不落库）；
 *   建组/新建计划/编辑计划表单按「焦点离开整个表单、且最近一次指针按下确在表单外」才确认
 *   （见 useOutsidePressConfirm），标题编辑框原本就是失焦保存、不动；② 已完成区的组/项/
 *   子任务行尾带垃圾桶（DoneTrashButton，两步确认，口径同行右键删除）；③ 待办/组/子任务
 *   标题收起态改最多显示 2 行（line-clamp-2），点击仍展开全文
 * - 第八十七轮（2 栏布局加密）：两节区加 pinned 模式（2 栏时由 TaskCard 传入）——整列
 *   flex 满高：标题行在顶、列表区（[data-task-col-scroll]）各自滚动占满中间、添加行钉列底；
 *   删两行独立空状态文案（提示已在输入框占位/按钮文字里）；「+ 建组」从整行虚线框降为
 *   待办标题行右侧小文字按钮（表单改在底部块内、添加框上方展开）；待办列计数去掉
 *   （卡头 x/y 已含），计划列计数保留为标题旁小灰字；行高/内距全面收一档
 */

interface RowMenuState {
  x: number;
  y: number;
  kind: 'task' | 'taskGroup' | 'taskChild' | 'plan';
  id: string;
  /** kind=taskChild 时为所属顶层待办 id */
  parentId?: string;
  title: string;
}

function rowMenuPosition(e: React.MouseEvent): { x: number; y: number } {
  const MENU_W = 180;
  const MENU_H = 190;
  return {
    x: Math.max(8, Math.min(e.clientX, window.innerWidth - MENU_W - 8)),
    y: Math.max(8, Math.min(e.clientY, window.innerHeight - MENU_H - 8)),
  };
}

/** 拖拽合并的起手阈值（px，与 useSiteDragSort 同值）：短距离移动只算点击，不误触 */
const TASK_DRAG_THRESHOLD = 7;

/**
 * 待办拖拽手势（第五十四轮合并，2026-11-08 加换顺序，沿用 useSiteDragSort 的 pending → active 两段式指针拖拽）：
 * - 行身 pointerdown 只登记 pending；越过阈值才激活：源行半透明、标题浮层跟随指针
 * - 落点分两种，看指针压在目标行的哪个位置（[data-task-entry]，且必须在本 hook 的 listRef 容器内）：
 *   行中部 → 合并（indigo 高亮），落盘走 onMerge；行上下 8px 边缘 → 换顺序（该处现一条插入线），
 *   落盘走 onReorder；拖到列表头顶/尾底空白处同样是换顺序（插到最前/最后）
 * - 子任务拖出（2026-11-08 用户令）：组内子任务行同样可起手（beginChildDrag），拖到顶层行边
 *   缘 = 抽出为顶层单项目（落盘走 onChildDrop 的 insert）；拖到另一组/单项目中部 = 移入该组或
 *   合并成新组（落盘走 onChildDrop 的 merge）；拖回自己组的边缘 = 抽出到组前/后，中部不算目标
 * - 松手：无目标、落在自己身上、Esc、pointercancel 一律取消复原
 * - 勾选框、展开箭头、输入框、按钮等控件（button/input/form 等）不作起手点，原有点击/右键交互不受影响
 */
function useTaskMergeDrag(
  onMerge: (sourceId: string, targetId: string) => void,
  onReorder: (sourceId: string, targetId: string, position: 'before' | 'after') => void,
  onChildDrop: (
    groupId: string,
    childId: string,
    target: { kind: 'insert'; id: string; position: 'before' | 'after' } | { kind: 'merge'; id: string },
  ) => void,
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  /** 换顺序落点：{ 目标行 id, 插到它之前/之后 }（与 overId 互斥） */
  const [insertAt, setInsertAt] = useState<{ id: string; position: 'before' | 'after' } | null>(null);
  const [clone, setClone] = useState<{ title: string; isGroup: boolean; w: number } | null>(null);
  const cloneRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const pendingRef = useRef<{
    id: string;
    title: string;
    isGroup: boolean;
    /** 子任务拖出时为源组 id；顶层条目拖动时缺省 */
    groupId?: string;
    pointerId: number;
    startX: number;
    startY: number;
  } | null>(null);
  const activeRef = useRef<{
    id: string;
    /** 子任务拖出时为源组 id；顶层条目拖动时缺省 */
    groupId?: string;
    pointerId: number;
    offsetX: number;
    offsetY: number;
    lastX: number;
    lastY: number;
    overId: string | null;
    insertAt: { id: string; position: 'before' | 'after' } | null;
  } | null>(null);
  const onMergeRef = useRef(onMerge);
  onMergeRef.current = onMerge;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onChildDropRef = useRef(onChildDrop);
  onChildDropRef.current = onChildDrop;
  /** 最近一次拖拽结束时刻（第六十九轮）：标题点击展开用它吞掉「拖完松手」紧随的那次 click */
  const lastDragEndAtRef = useRef(0);

  useEffect(() => {
    const positionClone = (x: number, y: number) => {
      const d = activeRef.current;
      if (d && cloneRef.current) {
        cloneRef.current.style.transform = `translate(${x - d.offsetX}px, ${y - d.offsetY}px)`;
      }
    };

    const endDrag = (commit: boolean) => {
      const d = activeRef.current;
      pendingRef.current = null;
      if (!d) return;
      lastDragEndAtRef.current = Date.now();
      activeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      const targetId = d.overId;
      const ins = d.insertAt;
      setDragId(null);
      setOverId(null);
      setInsertAt(null);
      setClone(null);
      if (!commit) return;
      if (d.groupId) {
        // 子任务拖出：中部 = 移入/合并，边缘 = 抽出为顶层单项目
        if (targetId && targetId !== d.groupId) onChildDropRef.current(d.groupId, d.id, { kind: 'merge', id: targetId });
        else if (ins) onChildDropRef.current(d.groupId, d.id, { kind: 'insert', id: ins.id, position: ins.position });
        return;
      }
      if (targetId && targetId !== d.id) onMergeRef.current(d.id, targetId);
      else if (ins && ins.id !== d.id) onReorderRef.current(d.id, ins.id, ins.position);
    };

    const updateOver = (x: number, y: number) => {
      const d = activeRef.current;
      if (!d) return;
      const list = listRef.current;
      let nextOver: string | null = null;
      let nextInsert: { id: string; position: 'before' | 'after' } | null = null;
      const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-task-entry]');
      if (el && list?.contains(el)) {
        const id = el.dataset.taskEntry;
        if (id && id !== d.id) {
          // 行上下 8px 边缘 = 换顺序/抽出（插到该行前/后），中部 = 合并；
          // 子任务拖回自己组时中部不算目标（已经在组里），边缘仍可抽出到组前/后
          const rect = el.getBoundingClientRect();
          if (y - rect.top < TASK_DRAG_EDGE_PX) nextInsert = { id, position: 'before' };
          else if (rect.bottom - y < TASK_DRAG_EDGE_PX) nextInsert = { id, position: 'after' };
          else if (!(d.groupId && id === d.groupId)) nextOver = id;
        }
      } else if (list) {
        // 列表头顶/尾底空白处：横向在列表内、纵向贴着第一条上方/最后一条下方 → 插到最前/最后
        const lr = list.getBoundingClientRect();
        if (x >= lr.left - 8 && x <= lr.right + 8) {
          const entries = [...list.querySelectorAll<HTMLElement>('[data-task-entry]')];
          const first = entries[0];
          const last = entries[entries.length - 1];
          if (first && y < first.getBoundingClientRect().top) {
            const fid = first.dataset.taskEntry;
            if (fid && fid !== d.id) nextInsert = { id: fid, position: 'before' };
          } else if (last && y > last.getBoundingClientRect().bottom) {
            const lid = last.dataset.taskEntry;
            if (lid && lid !== d.id) nextInsert = { id: lid, position: 'after' };
          }
        }
      }
      if (nextOver !== d.overId) {
        d.overId = nextOver;
        setOverId(nextOver);
      }
      const cur = d.insertAt;
      if (nextInsert?.id !== cur?.id || nextInsert?.position !== cur?.position) {
        d.insertAt = nextInsert;
        setInsertAt(nextInsert);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (!activeRef.current && pending && e.pointerId === pending.pointerId) {
        if (Math.hypot(e.clientX - pending.startX, e.clientY - pending.startY) < TASK_DRAG_THRESHOLD) return;
        // 子任务拖出：源行是组内子任务行（data-subtask-id），不是顶层落点行
        const entryEl = pending.groupId
          ? listRef.current?.querySelector<HTMLElement>(`[data-subtask-id="${pending.id}"]`)
          : listRef.current?.querySelector<HTMLElement>(`[data-task-entry="${pending.id}"]`);
        if (!entryEl) {
          pendingRef.current = null;
          return;
        }
        // 快照基准：组取头部行（整块含子任务太高），普通待办取行本身
        const gripEl = entryEl.querySelector<HTMLElement>('[data-task-grip]') ?? entryEl;
        const rect = gripEl.getBoundingClientRect();
        pendingRef.current = null;
        activeRef.current = {
          id: pending.id,
          groupId: pending.groupId,
          pointerId: pending.pointerId,
          offsetX: pending.startX - rect.left,
          offsetY: pending.startY - rect.top,
          lastX: e.clientX,
          lastY: e.clientY,
          overId: null,
          insertAt: null,
        };
        setDragId(pending.id);
        setClone({ title: pending.title, isGroup: pending.isGroup, w: Math.max(rect.width, 120) });
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      const d = activeRef.current;
      if (d && e.pointerId === d.pointerId) {
        d.lastX = e.clientX;
        d.lastY = e.clientY;
        positionClone(e.clientX, e.clientY);
        updateOver(e.clientX, e.clientY);
      }
    };

    /** 第二指落下（双指缩放开始）：取消合并拖拽的待命/进行中拖动，缩放优先（第七十三轮） */
    const onSecondPointerDown = (e: PointerEvent) => {
      if (pendingRef.current && e.pointerId !== pendingRef.current.pointerId) pendingRef.current = null;
      if (activeRef.current && e.pointerId !== activeRef.current.pointerId) endDrag(false);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (pendingRef.current && e.pointerId === pendingRef.current.pointerId) pendingRef.current = null;
      if (activeRef.current && e.pointerId === activeRef.current.pointerId) endDrag(true);
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (pendingRef.current && e.pointerId === pendingRef.current.pointerId) pendingRef.current = null;
      if (activeRef.current && e.pointerId === activeRef.current.pointerId) endDrag(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && activeRef.current) endDrag(false);
    };

    window.addEventListener('pointerdown', onSecondPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onSecondPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('keydown', onKeyDown);
      if (activeRef.current) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
  }, []);

  // 浮层挂载后先定位到抓起处，避免首帧闪到左上角（同 useSiteDragSort）
  useEffect(() => {
    const d = activeRef.current;
    if (clone && d && cloneRef.current) {
      cloneRef.current.style.transform = `translate(${d.lastX - d.offsetX}px, ${d.lastY - d.offsetY}px)`;
    }
  }, [clone]);

  /** 挂在顶层待办行身（普通行根 / 组头部行）上：只负责记下起手，控件与右键不作起手点 */
  const beginTaskDrag = (e: React.PointerEvent, task: TaskItem) => {
    if (e.button !== 0 || pendingRef.current || activeRef.current) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, input, textarea, select, a, form, [contenteditable="true"]')) return;
    pendingRef.current = {
      id: task.id,
      title: task.title,
      isGroup: isTaskGroup(task),
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  /** 挂在组内子任务行身上（2026-11-08）：起手点同上，另记源组 id 供落盘抽出/移入 */
  const beginChildDrag = (e: React.PointerEvent, group: TaskItem, child: TaskChild) => {
    if (e.button !== 0 || pendingRef.current || activeRef.current) return;
    const t = e.target as HTMLElement;
    if (t.closest('button, input, textarea, select, a, form, [contenteditable="true"]')) return;
    pendingRef.current = {
      id: child.id,
      title: child.title,
      isGroup: false,
      groupId: group.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  /** 刚结束过一次真实拖拽（400ms 内）：标题的 onClick 先问它，是则吞掉本次点击 */
  const wasJustDragged = () => Date.now() - lastDragEndAtRef.current < 400;

  return { dragId, overId, insertAt, clone, cloneRef, listRef, beginTaskDrag, beginChildDrag, wasJustDragged };
}

/** 拖拽换顺序的边缘带宽（px）：目标行上下各 8px 内松手 = 插到该行前/后，之外 = 合并 */
const TASK_DRAG_EDGE_PX = 8;

/**
 * 「点表单外 = 确认」的失焦判定（第七十五轮，多字段表单用）：表单根元素挂 ref 与 onBlur，
 * consumeBlur(e) 返回 true 才按确认处理。判定 = 焦点确已离开整个表单（relatedTarget 不在
 * 表单内），且最近一次指针按下确实落在表单外。两个附加条件缺一不可：
 * - 键盘 Tab 移出焦点不算「点击外面」，不触发；
 * - 点表单内按钮（切类型/取消/提交）在部分浏览器不移焦点、失焦的 relatedTarget 为空，
 *   若只看 relatedTarget 会被误判成点外面——指针按下在表单内时标记为假，天然豁免。
 */
function useOutsidePressConfirm() {
  const elRef = useRef<HTMLElement | null>(null);
  const pressedOutsideRef = useRef(false);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      pressedOutsideRef.current = !!elRef.current && !elRef.current.contains(e.target as Node);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, []);

  const setEl = (el: HTMLElement | null) => {
    elRef.current = el;
  };

  const consumeBlur = (e: React.FocusEvent): boolean => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return false;
    if (!pressedOutsideRef.current) return false;
    pressedOutsideRef.current = false;
    return true;
  };

  return { setEl, consumeBlur };
}

/**
 * 待办列（第二十五轮抽成共享组件；第六十九轮起面板取消，只由 2x 计划卡卡面承载，全功能）：
 * 勾选/添加/建组/组展开勾子任务/已完成折叠/行右键编辑删除/拖拽合并都在卡面直接完成；
 * 标题截断时点击文字展开全文、再点收起（第六十九轮）
 */
/** 笔记附件小图标（2026-11-20）：有图显图片图标，有视频/音乐/文件显回形针；标题后 */
function NoteAttachIcon({ notes }: { notes?: TaskNoteMsg[] }) {
  const flat = (notes ?? []).flatMap((n): (NoteAttachmentItem | TaskNoteMsg)[] =>
    n.kind === 'batch' ? (n.items ?? []) : n.kind === 'text' ? [] : [n],
  );
  const hasImage = flat.some((n) => n.kind === 'image');
  const hasOther = flat.some((n) => n.kind !== 'image');
  if (!hasImage && !hasOther) return null;
  return (
    <span data-note-image-icon className="inline-flex items-center gap-0.5 shrink-0 text-white/45">
      {hasImage && <ImageIcon size={13} />}
      {hasOther && <Paperclip size={12} />}
    </span>
  );
}

/** 笔记图片本地 id（noteImageDb 的键） */
const newNoteImageId = () => `ni-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 笔记附件的显示 URL（2026-11-20：同步附件从远端读 Blob 转内存 URL，不写 IndexedDB、不缓存；
 * 本机附件仍按 id 从 IndexedDB 取；卸载时回收） */
function useNoteAttachmentUrl(item: { imageId?: string; remotePath?: string } | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  const blobId = item?.imageId;
  const remotePath = item?.remotePath;
  useEffect(() => {
    if (!blobId && !remotePath) {
      setUrl(null);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    const load = remotePath ? fetchNoteRemoteBlob(remotePath) : loadNoteImage(blobId ?? '');
    load.then((blob) => {
      if (!alive || !blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [blobId, remotePath]);
  return url;
}

/** 文件大小显示（2026-11-20）：B/KB/MB */
function formatFileSize(bytes?: number) {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 按 MIME 判断附件是哪种泡泡（2026-11-20：图片/视频/音乐直接播，其他是文件） */
function detectNoteKind(file: File): NoteAttachmentItem['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  return 'file';
}

/** 笔记附件气泡内容（2026-11-20）：图片原图、视频/音乐带播放器、其他文件显示名字+大小+下载 */
function NoteAttachment({ item, alt }: { item: NoteAttachmentItem; alt: string }) {
  const url = useNoteAttachmentUrl(item);
  if (!url) {
    return (
      <span className="w-40 h-24 rounded-xl bg-white/10 flex items-center justify-center text-white/40">
        <ImageIcon size={18} />
      </span>
    );
  }
  if (item.kind === 'image') {
    return <img src={url} alt={alt} className="max-h-48 max-w-full rounded-xl object-contain bg-black/20" />;
  }
  if (item.kind === 'video') {
    return (
      <span className="block">
        <video src={url} controls preload="metadata" playsInline className="max-h-64 max-w-full rounded-xl bg-black/40" />
        {item.fileName && <span className="mt-1 block max-w-full truncate text-[11px] text-white/55">{item.fileName}</span>}
      </span>
    );
  }
  if (item.kind === 'audio') {
    return (
      <span className="block w-60 max-w-full">
        <audio src={url} controls preload="metadata" className="w-full" />
        {item.fileName && <span className="mt-1 block max-w-full truncate text-[11px] text-white/55">{item.fileName}</span>}
      </span>
    );
  }
  return (
    <a
      href={url}
      download={item.fileName || 'file'}
      data-note-file-download
      className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2 text-white/85 hover:bg-white/10"
    >
      <FileIcon size={16} className="shrink-0 text-white/55" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{item.fileName || alt}</span>
        <span className="block text-[11px] text-white/45">{formatFileSize(item.fileSize)}</span>
      </span>
      <Download size={14} className="shrink-0 text-white/55" />
    </a>
  );
}

/** 文件管理器里的一行（2026-11-20）：全部笔记里的一个附件，带来源、下载、删除 */
export interface NoteFileEntry {
  taskId: string;
  childId?: string;
  noteId: string;
  itemIndex: number;
  kind: NoteAttachmentItem['kind'];
  imageId: string;
  fileName?: string;
  fileSize?: number;
  /** 同步附件在仓库里的路径与 sha（有它就不读 IndexedDB、不缓存） */
  remotePath?: string;
  remoteSha?: string;
  sourceTitle: string;
}

function NoteFileRow({
  entry,
  onDelete,
  onJump,
}: {
  entry: NoteFileEntry;
  onDelete: (entry: NoteFileEntry) => void;
  onJump: (taskId: string, childId?: string) => void;
}) {
  const { t } = useLang();
  const url = useNoteAttachmentUrl(entry);
  return (
    <div data-note-file-row className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-2.5 py-2">
      {entry.kind === 'image' && url ? (
        <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover bg-black/30" />
      ) : entry.kind === 'video' && url ? (
        <video src={url} preload="metadata" muted className="h-10 w-10 shrink-0 rounded-lg object-cover bg-black/30" />
      ) : entry.kind === 'audio' ? (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/60">
          <Music size={16} />
        </span>
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/60">
          <FileIcon size={16} />
        </span>
      )}
      <button
        type="button"
        onClick={() => onJump(entry.taskId, entry.childId)}
        className="min-w-0 flex-1 text-left"
        title={entry.sourceTitle}
      >
        <span className="block truncate text-[13px] text-white/90">{entry.fileName || t('task.noteAddFile')}</span>
        <span className="block truncate text-[11px] text-white/45">
          {formatFileSize(entry.fileSize)}
          {entry.sourceTitle ? ` · ${entry.sourceTitle}` : ''}
        </span>
      </button>
      {url && (
        <a
          href={url}
          download={entry.fileName || 'file'}
          aria-label={t('task.noteDownload')}
          title={t('task.noteDownload')}
          data-note-file-download
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
        >
          <Download size={14} />
        </a>
      )}
      <button
        type="button"
        aria-label={t('task.noteDelete')}
        title={t('task.noteDelete')}
        data-note-file-delete={entry.imageId}
        onClick={() => onDelete(entry)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/50 hover:bg-red-500/10 hover:text-red-300"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/** 笔记文字里的 Markdown 表格（2026-11-20：发表格）：连续以 | 开头的行成表，第二行是分隔行才认；其余行照常显示 */
function renderNoteContent(text: string) {
  const lines = text.split('\n');
  const out: React.ReactNode[] = [];
  const isSep = (s: string) => /^\|[\s:|-]+\|$/.test(s.trim()) && s.includes('-');
  const cells = (s: string) =>
    s
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  let i = 0;
  while (i < lines.length) {
    if (lines[i].trim().startsWith('|') && i + 1 < lines.length && isSep(lines[i + 1])) {
      const head = cells(lines[i]);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|') && !isSep(lines[i])) {
        rows.push(cells(lines[i]));
        i++;
      }
      out.push(
        <span key={out.length} className="block overflow-x-auto my-1">
          <table className="border-collapse text-[12px] leading-snug">
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j} className="border border-white/25 bg-white/10 px-2 py-1 text-left font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j} className="border border-white/20 px-2 py-1">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </span>,
      );
    } else {
      const buf: string[] = [];
      while (i < lines.length && !(lines[i].trim().startsWith('|') && i + 1 < lines.length && isSep(lines[i + 1]))) {
        buf.push(lines[i]);
        i++;
      }
      const para = buf.join('\n').trim();
      if (para) out.push(<span key={out.length} className="block">{para}</span>);
    }
  }
  return out;
}

/** 取出文字里第一张 Markdown 表格（2026-11-20：表格泡泡双击进可视化编辑，不用手改 | 符号） */
type NoteTableData = { before: string; header: string[]; rows: string[][]; after: string };
function parseFirstNoteTable(text: string): NoteTableData | null {
  const lines = text.split('\n');
  const isSep = (s: string) => /^\|[\s:|-]+\|$/.test(s.trim()) && s.includes('-');
  const cells = (s: string) =>
    s
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
  for (let i = 0; i + 1 < lines.length; i++) {
    if (lines[i].trim().startsWith('|') && isSep(lines[i + 1])) {
      const header = cells(lines[i]);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j].trim().startsWith('|') && !isSep(lines[j])) {
        const row = cells(lines[j]);
        while (row.length < header.length) row.push('');
        rows.push(row.slice(0, header.length));
        j++;
      }
      return { before: lines.slice(0, i).join('\n').trim(), header, rows, after: lines.slice(j).join('\n').trim() };
    }
  }
  return null;
}

/** 可视化编辑后的表格写回 Markdown（单元格里的 | 写成全角 ｜，换行去空格，不断表） */
function noteTableToMarkdown(t: NoteTableData): string {
  const esc = (s: string) => s.replace(/\|/g, '｜').replace(/\n/g, ' ');
  const row = (cs: string[]) => `| ${cs.map(esc).join(' | ')} |`;
  const sep = `| ${t.header.map(() => '---').join(' | ')} |`;
  const body = [row(t.header), sep, ...t.rows.map(row)].join('\n');
  return [t.before, body, t.after].filter(Boolean).join('\n');
}

/** 待办笔记面板（2026-11-20）：气泡对话式笔记，一条消息一个气泡，可发文字/图片。
 * - 宽栏时常驻右栏（无选中时显示空提示）；窄栏时以浮层盖在待办列上，由调用方包一层定位壳 */
function TaskNotePane({
  title,
  notes,
  onSendText,
  onSendFiles,
  onDeleteNote,
  onEditText,
  onReplaceFiles,
  allFiles,
  onDeleteNoteFile,
  onJumpToNote,
  onClose,
  localOnlyCount,
  migrating,
  onMigrate,
  className,
}: {
  title: string | null;
  notes: TaskNoteMsg[];
  onSendText: (text: string) => void;
  onSendFiles: (files: File[]) => Promise<'tooLarge' | 'totalTooLarge' | 'uploadFailed' | null>;
  onDeleteNote: (noteId: string) => void;
  onEditText: (noteId: string, text: string) => void;
  onReplaceFiles: (noteId: string, files: File[]) => Promise<'tooLarge' | 'totalTooLarge' | 'uploadFailed' | null>;
  allFiles: NoteFileEntry[];
  onDeleteNoteFile: (entry: NoteFileEntry) => void;
  onJumpToNote: (taskId: string, childId?: string) => void;
  onClose: () => void;
  /** 只有本机副本的附件数（2026-11-20：同步登录后可一键传到仓库） */
  localOnlyCount: number;
  /** 正在把本机文件往仓库传 */
  migrating: boolean;
  /** 一键迁移本机文件（未登录同步时 null，不显示按钮） */
  onMigrate: (() => void) | null;
  className?: string;
}) {
  const { t } = useLang();
  const [draft, setDraft] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);
  const attachRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const replacingIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  /** 正在编辑的泡泡（2026-11-20）：双击泡泡直接进编辑，右键菜单也能进；附件泡泡的编辑是换文件 */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  /** 正在可视化编辑的表格（2026-11-20）：有表格的文字泡泡双击进格子编辑，null 时走原文本框 */
  const [editTable, setEditTable] = useState<NoteTableData | null>(null);
  /** 泡泡右键菜单（2026-11-20）：编辑 / 删除 */
  const [menu, setMenu] = useState<{ noteId: string; x: number; y: number } | null>(null);
  /** 文件管理器（2026-11-20）：列出全部笔记里的所有附件 */
  const [showFiles, setShowFiles] = useState(false);
  /** 超限提示（2026-11-20）：单文件 50 MB、总量 400 MB，选文件时立即提示 */
  const [limitHint, setLimitHint] = useState<string | null>(null);
  /** 本机存储配额（2026-11-20）：文件管理器里显示已用/配额 */
  const [storageEstimate, setStorageEstimate] = useState<{ usage?: number; quota?: number } | null>(null);
  useEffect(() => {
    if (!showFiles) return;
    navigator.storage
      ?.estimate?.()
      .then((e) => setStorageEstimate({ usage: e.usage, quota: e.quota }))
      .catch(() => undefined);
  }, [showFiles]);
  const notesFilesBytes = allFiles.reduce((sum, f) => sum + (f.fileSize ?? 0), 0);
  // 新消息来了滚到底
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [notes.length]);
  // 输入框随内容长高，最多 120px（表格是多行的）
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const send = () => {
    const v = draft.trim();
    if (!v) return;
    onSendText(v);
    setDraft('');
  };

  /** 限额/上传提示文案（2026-11-20：单文件与总量按登录方式分档，GitHub 100 MB/4 GB、Gitee 50 MB/400 MB） */
  const limitHintText = (code: 'tooLarge' | 'totalTooLarge' | 'uploadFailed'): string => {
    const provider = getActiveNoteSync()?.provider ?? 'gitee';
    if (code === 'tooLarge') return t('task.noteFileTooLarge', { n: String(noteLimitsFor(provider).singleMB) });
    if (code === 'totalTooLarge') return t('task.noteTotalTooLarge', { n: noteTotalLimitLabel(provider) });
    return t('task.noteUploadFailed');
  };

  /** 选文件入口（图片/附件两个 input 共用）：先过限额，传不上去再提示 */
  const handlePickedFiles = async (files: File[]) => {
    if (!files.length) return;
    setLimitHint(null);
    const code = await onSendFiles(files);
    if (code) setLimitHint(limitHintText(code));
  };

  const startEdit = (msg: TaskNoteMsg) => {
    setMenu(null);
    if (msg.kind !== 'text') {
      // 附件泡泡的编辑是换文件：按原类型过滤选图器，批量泡泡可多选
      const input = replaceRef.current;
      if (input) {
        input.accept =
          msg.kind === 'image' ? 'image/*' : msg.kind === 'video' ? 'video/*' : msg.kind === 'audio' ? 'audio/*' : '*/*';
        input.multiple = msg.kind === 'batch';
      }
      replacingIdRef.current = msg.id;
      input?.click();
      return;
    }
    const table = parseFirstNoteTable(msg.text ?? '');
    if (table) {
      setEditTable(table);
      setEditDraft('');
    } else {
      setEditTable(null);
      setEditDraft(msg.text ?? '');
    }
    setEditingId(msg.id);
  };

  /** 取消泡泡编辑（文本框与表格格子共用） */
  const cancelEdit = () => {
    setEditingId(null);
    setEditTable(null);
  };

  const commitEdit = () => {
    if (editingId && editTable) {
      onEditText(editingId, noteTableToMarkdown(editTable));
    } else {
      const v = editDraft.trim();
      if (editingId && v) onEditText(editingId, v);
    }
    setEditingId(null);
    setEditTable(null);
  };

  /** 改表格格子里一个单元格（ri=-1 改表头） */
  const updateEditCell = (ri: number, ci: number, v: string) => {
    setEditTable((t) => {
      if (!t) return t;
      if (ri < 0) {
        const header = [...t.header];
        header[ci] = v;
        return { ...t, header };
      }
      return { ...t, rows: t.rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? v : c)) : r)) };
    });
  };
  /** 表格编辑：加行 / 加列 / 删末行 / 删末列（至少留 1 列） */
  const addEditRow = () => setEditTable((t) => (t ? { ...t, rows: [...t.rows, Array(t.header.length).fill('')] } : t));
  const addEditCol = () =>
    setEditTable((t) =>
      t ? { ...t, header: [...t.header, ''], rows: t.rows.map((r) => [...r, '']) } : t,
    );
  const delEditRow = () => setEditTable((t) => (t && t.rows.length ? { ...t, rows: t.rows.slice(0, -1) } : t));
  const delEditCol = () =>
    setEditTable((t) =>
      t && t.header.length > 1
        ? { ...t, header: t.header.slice(0, -1), rows: t.rows.map((r) => r.slice(0, -1)) }
        : t,
    );

  /** 插入一张空表格模板（2026-11-20）：3 列 2 行，插在光标处，发送后渲染成表格 */
  const insertTableTemplate = () => {
    const template = '|  |  |  |\n| --- | --- | --- |\n|  |  |  |';
    const el = inputRef.current;
    const pos = el?.selectionStart ?? draft.length;
    setDraft(`${draft.slice(0, pos)}${draft ? '\n' : ''}${template}\n${draft.slice(pos)}`);
    requestAnimationFrame(() => {
      el?.focus();
      const at = pos + (draft ? 1 : 0) + template.length + 1;
      el?.setSelectionRange(at, at);
    });
  };

  return (
    <div data-note-pane className={`flex flex-col min-h-0 ${className ?? ''}`}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/10 shrink-0 min-w-0">
        {showFiles ? (
          <>
            <button
              type="button"
              aria-label={t('task.noteBackToNotes')}
              title={t('task.noteBackToNotes')}
              data-note-files-back
              onClick={() => setShowFiles(false)}
              className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white/55 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ArrowLeft size={14} />
            </button>
            <span data-note-title className="flex-1 min-w-0 truncate text-sm font-medium text-white/90">
              {t('task.noteFiles')} · {allFiles.length}
            </span>
          </>
        ) : (
          <>
            <span data-note-title className="flex-1 min-w-0 truncate text-sm font-medium text-white/90">
              {title ?? t('task.noteTitle')}
            </span>
            {title && (
              <button
                type="button"
                aria-label={t('task.noteFiles')}
                title={t('task.noteFiles')}
                data-note-files
                onClick={() => setShowFiles(true)}
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white/45 hover:text-white hover:bg-white/10 transition-colors"
              >
                <FolderOpen size={14} />
              </button>
            )}
          </>
        )}
        {title && (
          <button
            type="button"
            aria-label={t('task.noteClose')}
            title={t('task.noteClose')}
            data-note-close
            onClick={onClose}
            className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white/45 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-2.5">
        {showFiles ? (
          <>
            <p className="text-[11px] text-zinc-500 px-1">
              {t('task.noteFiles')} · {formatFileSize(notesFilesBytes)} / {noteTotalLimitLabel(getActiveNoteSync()?.provider ?? 'gitee')}
              {storageEstimate?.quota
                ? ` · ${t('task.noteLocalStorage')} ${formatFileSize(storageEstimate.usage ?? 0)} / ${formatFileSize(storageEstimate.quota)}`
                : ''}
            </p>
            {localOnlyCount > 0 && onMigrate && (
              <button
                type="button"
                data-note-migrate
                disabled={migrating}
                onClick={onMigrate}
                className="self-start rounded-lg bg-white/5 px-2.5 py-1.5 text-[12px] text-white/75 hover:bg-white/10 disabled:opacity-50"
              >
                {migrating ? t('task.noteMigrating') : t('task.noteMigrate')}
              </button>
            )}
            {allFiles.length === 0 ? (
              <p className="m-auto text-[13px] text-zinc-400 text-center px-4">{t('task.noteNoFiles')}</p>
            ) : (
              allFiles.map((entry) => (
                <Fragment key={`${entry.noteId}-${entry.itemIndex}`}>
                  <NoteFileRow
                    entry={entry}
                    onDelete={onDeleteNoteFile}
                    onJump={(taskId: string, childId?: string) => {
                      setShowFiles(false);
                      onJumpToNote(taskId, childId);
                    }}
                  />
                </Fragment>
              ))
            )}
          </>
        ) : !title ? (
          <p className="m-auto text-[13px] text-zinc-400 text-center px-4">{t('task.noteEmpty')}</p>
        ) : notes.length === 0 ? (
          <p className="m-auto text-[13px] text-zinc-400 text-center px-4">{t('task.noteEmptyItem')}</p>
        ) : (
          // 文字气泡按行打包排布（2026-11-20）：一排能放下就往后排，放不下一整句才换行；图片/视频/文件泡泡仍独占一排
          <div className="flex flex-wrap items-start justify-end gap-2.5">
          {notes.map((msg) => {
            const editing = editingId === msg.id;
            return (
              <div
                key={msg.id}
                data-note-bubble
                onDoubleClick={() => startEdit(msg)}
                onContextMenu={(e) => {
                  // 只出泡泡菜单：拦住冒泡到卡片包装层，否则同时弹出卡的尺寸菜单盖住它（2026-11-20）
                  e.preventDefault();
                  e.stopPropagation();
                  setMenu({ noteId: msg.id, x: e.clientX, y: e.clientY });
                }}
                className={`flex flex-col items-end min-w-0 cursor-default select-none ${
                  editing || msg.kind !== 'text' ? 'w-full' : 'w-fit max-w-[88%]'
                }`}
              >
                {editing && msg.kind === 'text' ? (
                  <div className="w-[88%] rounded-2xl rounded-br-md bg-indigo-500/80 p-2">
                    {editTable ? (
                      <>
                        <div className="overflow-x-auto" data-note-table-editor>
                          <table className="border-collapse text-[12px] leading-snug w-full">
                            <thead>
                              <tr>
                                {editTable.header.map((c, j) => (
                                  <th key={j} className="border border-white/25 bg-white/10 p-0">
                                    <input
                                      value={c}
                                      onChange={(e) => updateEditCell(-1, j, e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Escape') cancelEdit();
                                      }}
                                      data-note-table-cell={`h-${j}`}
                                      className="w-full min-w-[48px] bg-transparent px-2 py-1 text-white outline-none"
                                    />
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {editTable.rows.map((r, ri) => (
                                <tr key={ri}>
                                  {r.map((c, j) => (
                                    <td key={j} className="border border-white/20 p-0">
                                      <input
                                        value={c}
                                        onChange={(e) => updateEditCell(ri, j, e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Escape') cancelEdit();
                                        }}
                                        data-note-table-cell={`${ri}-${j}`}
                                        className="w-full min-w-[48px] bg-transparent px-2 py-1 text-white outline-none"
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          <button
                            type="button"
                            data-note-table-add-row
                            onClick={addEditRow}
                            className="rounded-md px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/10"
                          >
                            {t('task.noteAddRow')}
                          </button>
                          <button
                            type="button"
                            data-note-table-add-col
                            onClick={addEditCol}
                            className="rounded-md px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/10"
                          >
                            {t('task.noteAddCol')}
                          </button>
                          <button
                            type="button"
                            data-note-table-del-row
                            onClick={delEditRow}
                            className="rounded-md px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/10"
                          >
                            {t('task.noteDelRow')}
                          </button>
                          <button
                            type="button"
                            data-note-table-del-col
                            onClick={delEditCol}
                            className="rounded-md px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/10"
                          >
                            {t('task.noteDelCol')}
                          </button>
                          <span className="flex-1" />
                          <button
                            type="button"
                            data-note-edit-cancel
                            onClick={cancelEdit}
                            className="rounded-md px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/10"
                          >
                            {t('task.noteCancel')}
                          </button>
                          <button
                            type="button"
                            data-note-edit-save
                            onClick={commitEdit}
                            className="rounded-md bg-white/20 px-2 py-0.5 text-[12px] text-white hover:bg-white/30"
                          >
                            {t('task.noteSave')}
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <textarea
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                              e.preventDefault();
                              commitEdit();
                            } else if (e.key === 'Escape') {
                              cancelEdit();
                            }
                          }}
                          autoFocus
                          rows={3}
                          data-note-edit-input
                          className="w-full resize-none rounded-lg bg-white/10 px-2 py-1.5 text-[13px] leading-relaxed text-white outline-none placeholder:text-white/50"
                        />
                        <div className="mt-1.5 flex justify-end gap-1">
                          <button
                            type="button"
                            data-note-edit-cancel
                            onClick={cancelEdit}
                            className="rounded-md px-2 py-0.5 text-[12px] text-white/70 hover:bg-white/10"
                          >
                            {t('task.noteCancel')}
                          </button>
                          <button
                            type="button"
                            data-note-edit-save
                            onClick={commitEdit}
                            className="rounded-md bg-white/20 px-2 py-0.5 text-[12px] text-white hover:bg-white/30"
                          >
                            {t('task.noteSave')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : msg.kind === 'batch' && msg.items ? (
                  <div className="flex max-w-[88%] flex-col items-end gap-1.5">
                    {msg.items.map((item, j) => (
                      <div
                        key={`${item.imageId}-${j}`}
                        className="max-w-full overflow-hidden rounded-2xl rounded-br-md bg-white/5 p-1"
                      >
                        <NoteAttachment item={item} alt={t('task.noteAddImage')} />
                      </div>
                    ))}
                  </div>
                ) : msg.kind !== 'text' && (msg.imageId || msg.remotePath) ? (
                  <div className="max-w-[88%] overflow-hidden rounded-2xl rounded-br-md bg-white/5 p-1">
                    <NoteAttachment
                      item={{
                        kind: msg.kind as NoteAttachmentItem['kind'],
                        imageId: msg.imageId ?? '',
                        fileName: msg.fileName,
                        fileSize: msg.fileSize,
                        remotePath: msg.remotePath,
                        remoteSha: msg.remoteSha,
                      }}
                      alt={t('task.noteAddImage')}
                    />
                  </div>
                ) : (
                  <div className="min-w-0 max-w-full rounded-2xl rounded-br-md bg-indigo-500/80 px-3 py-2 text-[13px] leading-relaxed break-words whitespace-pre-wrap text-white">
                    {renderNoteContent(msg.text ?? '')}
                  </div>
                )}
              </div>
            );
          })}
          </div>
        )}
      </div>
      {title && !showFiles && (
        <div className="shrink-0 border-t border-white/10">
          {limitHint && <p className="px-3 pt-2 text-[11px] text-red-300">{limitHint}</p>}
          <div className="px-2.5 py-2 flex items-center gap-1.5">
            <button
              type="button"
              aria-label={t('task.noteAddImage')}
              title={t('task.noteAddImage')}
              data-note-image
              onClick={() => fileRef.current?.click()}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white/55 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ImagePlus size={16} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              data-note-image-input
              className="hidden"
              onChange={(e) => {
                void handlePickedFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              aria-label={t('task.noteAddTable')}
              title={t('task.noteAddTable')}
              data-note-table
              onClick={insertTableTemplate}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white/55 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Table size={16} />
            </button>
            <button
              type="button"
              aria-label={t('task.noteAddFile')}
              title={t('task.noteAddFile')}
              data-note-attach
              onClick={() => attachRef.current?.click()}
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-white/55 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Paperclip size={16} />
            </button>
            <input
              ref={attachRef}
              type="file"
              multiple
              data-note-attach-input
              className="hidden"
              onChange={(e) => {
                void handlePickedFiles([...(e.target.files ?? [])]);
                e.target.value = '';
              }}
            />
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // 输入法组合中的回车只上屏，别把半成品笔记提前发送；Shift+回车换行（表格要多行）
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t('task.notePlaceholder')}
            data-note-input
            rows={1}
            className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-xl px-2.5 py-1.5 text-[13px] leading-relaxed outline-none focus:border-indigo-400/50 placeholder:text-zinc-400 resize-none overflow-y-auto"
          />
          <button
            type="button"
            aria-label={t('task.noteSend')}
            title={t('task.noteSend')}
            data-note-send
            onClick={send}
            disabled={!draft.trim()}
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-indigo-500/80 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
          >
            <SendHorizontal size={15} />
          </button>
          </div>
        </div>
      )}
      {/* 泡泡右键菜单（2026-11-20）：编辑 / 删除 */}
      {menu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu(null);
            }}
          />
          <div
            className="fixed z-50 min-w-[120px] rounded-xl bg-[#23232c] py-1 shadow-xl ring-1 ring-white/15"
            style={{ left: Math.min(menu.x, window.innerWidth - 140), top: Math.min(menu.y, window.innerHeight - 90) }}
            onContextMenu={(e) => {
              // 菜单上再右键不另开菜单（2026-11-20）
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <button
              type="button"
              data-note-menu-edit
              onClick={() => {
                const msg = notes.find((n) => n.id === menu.noteId);
                if (msg) startEdit(msg);
              }}
              className="w-full px-3 py-1.5 text-left text-[13px] text-white/85 hover:bg-white/10"
            >
              {t('task.noteEdit')}
            </button>
            <button
              type="button"
              data-note-menu-delete
              onClick={() => {
                onDeleteNote(menu.noteId);
                setMenu(null);
              }}
              className="w-full px-3 py-1.5 text-left text-[13px] text-red-300 hover:bg-red-500/10"
            >
              {t('task.noteDelete')}
            </button>
          </div>
        </>
      )}
      {/* 附件泡泡换文件（2026-11-20）：双击/右键编辑附件泡泡时弹选文件，换掉原文件；批量泡泡可多选 */}
      <input
        ref={replaceRef}
        type="file"
        accept="image/*"
        data-note-image-replace-input
        className="hidden"
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          const id = replacingIdRef.current;
          if (files.length && id) {
            setLimitHint(null);
            const code = await onReplaceFiles(id, files);
            if (code) setLimitHint(limitHintText(code));
          }
          replacingIdRef.current = null;
          e.target.value = '';
        }}
      />
    </div>
  );
}

export function TasksSection({ store, pinned = false, wide = false }: { store: LocalStore; pinned?: boolean; wide?: boolean }) {
  const { tasks } = store.data;
  const { t } = useLang();
  const [menu, setMenu] = useState<RowMenuState | null>(null);
  /** 「已完成」分组头右键菜单（第四十八轮）：只记位置，开/关与行菜单分开管理 */
  const [doneMenu, setDoneMenu] = useState<{ x: number; y: number } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  /** 正在双击编辑的小组内子任务（2026-11-20）：{ 组 id, 子任务 id }，与顶层编辑互斥 */
  const [editingChild, setEditingChild] = useState<{ groupId: string; childId: string } | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [newTask, setNewTask] = useState('');
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [groupName, setGroupName] = useState('');
  /** 两个草稿的 ref 镜像（理由同 GroupBlock 第五十七轮注：回车显式提交 + 同步清零防重复） */
  const newTaskRef = useRef('');
  const groupNameRef = useRef('');
  /** 建组表单的「点外面 = 确认」判定（第七十五轮） */
  const groupConfirm = useOutsidePressConfirm();
  /** 待办拖拽合并 + 换顺序 + 子任务拖出（第五十四轮合并，2026-11-08 加换顺序/拖出）：手势状态在本节内管理 */
  const drag = useTaskMergeDrag(store.mergeTaskIntoGroup, store.reorderTasks, store.moveSubTask);
  /** 标题展开全文的条目 id 集合（第六十九轮，点击文字切换；与编辑态互不干扰） */
  const [expandedTitles, setExpandedTitles] = useState<ReadonlySet<string>>(new Set());
  const toggleTitle = (id: string) => {
    if (drag.wasJustDragged()) return;
    setExpandedTitles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 顶层条目按完成态分未完成/已完成两区；列内不再单列计数（第八十七轮去重：卡头 x/y 已含待办计数）
  const openEntries = tasks.filter((t) => !taskEntryDone(t));
  const doneEntries = tasks.filter((t) => taskEntryDone(t));

  const openMenu = (e: React.MouseEvent, kind: RowMenuState['kind'], id: string, title: string, parentId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ ...rowMenuPosition(e), kind, id, title, parentId });
  };

  const startEditTask = (task: TaskItem) => {
    setEditingChild(null);
    setEditingTaskId(task.id);
    setEditText(task.title);
  };

  const commitEditTask = () => {
    if (editingTaskId) store.renameTask(editingTaskId, editText);
    setEditingTaskId(null);
  };

  /** 小组内子任务双击编辑（2026-11-20）：与顶层条目共用 editText/titleEditor，提交走 renameSubTask */
  const startEditChild = (groupId: string, child: TaskChild) => {
    setEditingTaskId(null);
    setEditingChild({ groupId, childId: child.id });
    setEditText(child.title);
  };

  const commitEditChild = () => {
    if (editingChild) store.renameSubTask(editingChild.groupId, editingChild.childId, editText);
    setEditingChild(null);
  };

  /** 当前打开笔记的条目（2026-11-20）：点标题开笔记；childId 有值时是组内子任务 */
  const [openNote, setOpenNote] = useState<{ taskId: string; childId?: string } | null>(null);
  /** 窄栏点标题开笔记的防双击延时（2026-11-20）：单击 240ms 后才开，240ms 内第二击是双击改名、取消开笔记；
   * 宽栏右栏常驻、列表不动，点标题直接开，无需延时 */
  const noteClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openNoteFor = (target: { taskId: string; childId?: string }) => {
    if (wide) {
      setOpenNote(target);
      return;
    }
    if (noteClickTimer.current) {
      clearTimeout(noteClickTimer.current);
      noteClickTimer.current = null;
      return;
    }
    noteClickTimer.current = setTimeout(() => {
      noteClickTimer.current = null;
      setOpenNote(target);
    }, 240);
  };
  const openNoteTask = openNote ? tasks.find((t) => t.id === openNote.taskId) : undefined;
  const openNoteChild = openNote?.childId
    ? openNoteTask?.children?.find((c) => c.id === openNote.childId)
    : undefined;
  const openNoteTitle = openNoteTask
    ? (openNoteChild?.title ?? openNoteTask.title)
    : null;
  const openNoteNotes: TaskNoteMsg[] = openNoteTask
    ? (openNoteChild?.notes ?? openNoteTask.notes ?? [])
    : [];
  /** 全部笔记里的附件总字节数（2026-11-20：总量 400 MB 上限用；含小组子任务和批量泡泡） */
  const notesFilesBytesTotal = useMemo(
    () =>
      tasks
        .flatMap((t) => [...(t.notes ?? []), ...(t.children ?? []).flatMap((c) => c.notes ?? [])])
        .reduce(
          (sum, n) => sum + (n.fileSize ?? 0) + (n.items ?? []).reduce((s, it) => s + (it.fileSize ?? 0), 0),
          0,
        ),
    [tasks],
  );
  /** 附件限额检查（2026-11-20：按登录方式分档，GitHub 单文件 100 MB/总量 4 GB、Gitee 50 MB/400 MB；
   * 未登录默认按 Gitee 的严口径；换文件时旧文件大小不计） */
  const checkNoteFilesLimit = (files: File[], replacingBytes = 0): 'tooLarge' | 'totalTooLarge' | null => {
    const limits = noteLimitsFor(getActiveNoteSync()?.provider ?? 'gitee');
    if (files.some((f) => f.size > limits.singleMB * 1024 * 1024)) return 'tooLarge';
    const addBytes = files.reduce((s, f) => s + f.size, 0);
    if (notesFilesBytesTotal - replacingBytes + addBytes > limits.totalMB * 1024 * 1024) return 'totalTooLarge';
    return null;
  };
  /** 全部笔记里的所有附件（2026-11-20：文件管理器用；含小组子任务） */
  const allNoteFiles: NoteFileEntry[] = useMemo(() => {
    const out: NoteFileEntry[] = [];
    const walk = (taskId: string, childId: string | undefined, sourceTitle: string, notes?: TaskNoteMsg[]) => {
      (notes ?? []).forEach((n) => {
        if (n.kind === 'batch') {
          (n.items ?? []).forEach((it, j) =>
            out.push({
              taskId,
              childId,
              noteId: n.id,
              itemIndex: j,
              kind: it.kind,
              imageId: it.imageId,
              fileName: it.fileName,
              fileSize: it.fileSize,
              remotePath: it.remotePath,
              remoteSha: it.remoteSha,
              sourceTitle,
            }),
          );
        } else if (n.kind !== 'text' && (n.imageId || n.remotePath)) {
          out.push({
            taskId,
            childId,
            noteId: n.id,
            itemIndex: 0,
            kind: n.kind as NoteAttachmentItem['kind'],
            imageId: n.imageId ?? '',
            fileName: n.fileName,
            fileSize: n.fileSize,
            remotePath: n.remotePath,
            remoteSha: n.remoteSha,
            sourceTitle,
          });
        }
      });
    };
    tasks.forEach((t) => {
      walk(t.id, undefined, t.title, t.notes);
      (t.children ?? []).forEach((c) => walk(t.id, c.id, `${t.title} / ${c.title}`, c.notes));
    });
    return out;
  }, [tasks]);
  /** 删一条附件的本体数据（2026-11-20：删笔记即删数据；同步附件删仓库里的文件，本机附件删 IndexedDB） */
  const deleteAttachmentData = (it: { imageId?: string; remotePath?: string; remoteSha?: string }) => {
    if (it.remotePath) void deleteNoteRemoteFile(it.remotePath, it.remoteSha);
    else if (it.imageId) void deleteNoteImage(it.imageId);
  };
  /** 文件管理器里删一个附件（2026-11-20）：批量泡泡只摘掉这一项，摘空了整条消息也没了；单个附件整条消息一起删 */
  const deleteNoteFile = (entry: NoteFileEntry) => {
    const task = tasks.find((t) => t.id === entry.taskId);
    const notes = entry.childId ? task?.children?.find((c) => c.id === entry.childId)?.notes : task?.notes;
    const msg = notes?.find((n) => n.id === entry.noteId);
    if (!msg) return;
    if (msg.kind === 'batch') {
      const items = (msg.items ?? []).filter((_, j) => j !== entry.itemIndex);
      if (items.length) {
        if (entry.childId) store.updateSubTaskNote(entry.taskId, entry.childId, entry.noteId, { items });
        else store.updateTaskNote(entry.taskId, entry.noteId, { items });
      } else if (entry.childId) store.deleteSubTaskNote(entry.taskId, entry.childId, entry.noteId);
      else store.deleteTaskNote(entry.taskId, entry.noteId);
    } else if (entry.childId) store.deleteSubTaskNote(entry.taskId, entry.childId, entry.noteId);
    else store.deleteTaskNote(entry.taskId, entry.noteId);
    deleteAttachmentData(entry);
  };
  /** 删一条待办/组时连它的笔记附件本体一起删（2026-11-20：删笔记即删数据，删任务同理） */
  const collectTaskNoteFiles = (task: TaskItem): { imageId?: string; remotePath?: string; remoteSha?: string }[] => {
    const notes = [...(task.notes ?? []), ...(task.children ?? []).flatMap((c) => c.notes ?? [])];
    return notes.flatMap((n): { imageId?: string; remotePath?: string; remoteSha?: string }[] =>
      n.kind === 'batch' ? (n.items ?? []) : [n],
    );
  };
  const deleteTaskCascade = (taskId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    const doomed = task ? collectTaskNoteFiles(task) : [];
    store.deleteTask(taskId);
    doomed.forEach(deleteAttachmentData);
  };
  const deleteSubTaskCascade = (taskId: string, childId: string) => {
    const child = tasks.find((t) => t.id === taskId)?.children?.find((c) => c.id === childId);
    const doomed = (child?.notes ?? []).flatMap((n): { imageId?: string; remotePath?: string; remoteSha?: string }[] =>
      n.kind === 'batch' ? (n.items ?? []) : [n],
    );
    store.deleteSubTask(taskId, childId);
    doomed.forEach(deleteAttachmentData);
  };
  /** 只有本机副本的附件（2026-11-20：同步登录后可一键传到仓库，之后换设备也能看到） */
  const localOnlyFiles = useMemo(() => allNoteFiles.filter((f) => !f.remotePath), [allNoteFiles]);
  const [migrating, setMigrating] = useState(false);
  /** 一键迁移本机文件到仓库（2026-11-20）：按笔记逐条传，整条传完才改消息、删本机副本；传不上去的跳过留本机 */
  const migrateLocalFiles = () => {
    const sync = getActiveNoteSync();
    if (!sync || !localOnlyFiles.length || migrating) return;
    setMigrating(true);
    void (async () => {
      const groups = new Map<string, { taskId: string; childId?: string; noteId: string; entries: NoteFileEntry[] }>();
      for (const entry of localOnlyFiles) {
        const key = `${entry.taskId}/${entry.childId ?? ''}/${entry.noteId}`;
        const g = groups.get(key) ?? { taskId: entry.taskId, childId: entry.childId, noteId: entry.noteId, entries: [] };
        g.entries.push(entry);
        groups.set(key, g);
      }
      for (const g of groups.values()) {
        const task = tasks.find((t) => t.id === g.taskId);
        const list = g.childId ? task?.children?.find((c) => c.id === g.childId)?.notes : task?.notes;
        const msg = list?.find((n) => n.id === g.noteId);
        if (!msg) continue;
        const uploadOne = async (entry: NoteFileEntry) => {
          const blob = await loadNoteImage(entry.imageId);
          if (!blob) return null;
          const up = await uploadNoteFile(new File([blob], entry.fileName || 'file', { type: blob.type }), entry.imageId);
          if (!up) return null;
          await deleteNoteImage(entry.imageId);
          return up;
        };
        if (msg.kind === 'batch') {
          const items = [...(msg.items ?? [])];
          let changed = false;
          for (const entry of g.entries) {
            const up = await uploadOne(entry);
            if (!up) continue;
            items[entry.itemIndex] = { ...items[entry.itemIndex], remotePath: up.remotePath, remoteSha: up.sha };
            changed = true;
          }
          if (!changed) continue;
          if (g.childId) store.updateSubTaskNote(g.taskId, g.childId, g.noteId, { items });
          else store.updateTaskNote(g.taskId, g.noteId, { items });
        } else {
          const up = await uploadOne(g.entries[0]);
          if (!up) continue;
          if (g.childId) store.updateSubTaskNote(g.taskId, g.childId, g.noteId, { remotePath: up.remotePath, remoteSha: up.sha });
          else store.updateTaskNote(g.taskId, g.noteId, { remotePath: up.remotePath, remoteSha: up.sha });
        }
      }
      setMigrating(false);
    })();
  };
  /** 文件管理器里点来源标题：跳到那条笔记 */
  const jumpToNote = (taskId: string, childId?: string) => setOpenNote({ taskId, childId });
  const sendNoteText = (text: string) => {
    if (!openNote) return;
    if (openNote.childId) store.addSubTaskNote(openNote.taskId, openNote.childId, { kind: 'text', text });
    else store.addTaskNote(openNote.taskId, { kind: 'text', text });
  };
  const sendNoteFiles = async (files: File[]): Promise<'tooLarge' | 'totalTooLarge' | 'uploadFailed' | null> => {
    if (!openNote || !files.length) return null;
    const code = checkNoteFilesLimit(files);
    if (code) return code;
    const sync = getActiveNoteSync();
    const addMsg = (msg: TaskNoteMsgInput) => {
      if (openNote.childId) store.addSubTaskNote(openNote.taskId, openNote.childId, msg);
      else store.addTaskNote(openNote.taskId, msg);
    };
    if (sync) {
      // 同步已登录：附件直接存仓库，不写本机、不缓存；传不上去的不落库
      if (files.length === 1) {
        const file = files[0];
        const imageId = newNoteImageId();
        const up = await uploadNoteFile(file, imageId);
        if (!up) return 'uploadFailed';
        addMsg({ kind: detectNoteKind(file), imageId, remotePath: up.remotePath, remoteSha: up.sha, fileName: file.name, fileSize: file.size });
        return null;
      }
      const items: NoteAttachmentItem[] = [];
      for (const file of files) {
        const imageId = newNoteImageId();
        const up = await uploadNoteFile(file, imageId);
        if (!up) continue;
        items.push({ kind: detectNoteKind(file), imageId, remotePath: up.remotePath, remoteSha: up.sha, fileName: file.name, fileSize: file.size });
      }
      if (!items.length) return 'uploadFailed';
      addMsg({ kind: 'batch', items });
      return null;
    }
    // 未登录同步：附件只存本机（老口径）
    if (files.length === 1) {
      const file = files[0];
      const imageId = newNoteImageId();
      if (!(await saveNoteImage(imageId, file))) return 'uploadFailed';
      addMsg({ kind: detectNoteKind(file), imageId, fileName: file.name, fileSize: file.size });
      return null;
    }
    const items: NoteAttachmentItem[] = [];
    for (const file of files) {
      const imageId = newNoteImageId();
      if (!(await saveNoteImage(imageId, file))) continue;
      items.push({ kind: detectNoteKind(file), imageId, fileName: file.name, fileSize: file.size });
    }
    if (!items.length) return 'uploadFailed';
    addMsg({ kind: 'batch', items });
    return null;
  };
  const deleteNoteMsg = (noteId: string) => {
    if (!openNote) return;
    const msg = openNoteNotes.find((n) => n.id === noteId);
    if (openNote.childId) store.deleteSubTaskNote(openNote.taskId, openNote.childId, noteId);
    else store.deleteTaskNote(openNote.taskId, noteId);
    if (msg) deleteAttachmentData(msg);
    (msg?.items ?? []).forEach(deleteAttachmentData);
  };
  /** 改一条笔记的文字（2026-11-20：双击泡泡/右键菜单编辑） */
  const editNoteText = (noteId: string, text: string) => {
    if (!openNote) return;
    if (openNote.childId) store.updateSubTaskNote(openNote.taskId, openNote.childId, noteId, { text });
    else store.updateTaskNote(openNote.taskId, noteId, { text });
  };
  /** 换附件（2026-11-20：双击/右键编辑附件泡泡；单个换单个，批量泡泡换整批；新文件存好才换，旧文件随后删；
   * 同步已登录时新文件存仓库、旧文件从仓库删） */
  const replaceNoteFiles = async (noteId: string, files: File[]): Promise<'tooLarge' | 'totalTooLarge' | 'uploadFailed' | null> => {
    if (!openNote || !files.length) return null;
    const msg = openNoteNotes.find((n) => n.id === noteId);
    if (!msg) return null;
    const oldBytes = (msg.fileSize ?? 0) + (msg.items ?? []).reduce((s, it) => s + (it.fileSize ?? 0), 0);
    const code = checkNoteFilesLimit(files, oldBytes);
    if (code) return code;
    const oldFiles = [msg, ...(msg.items ?? [])];
    const patchMsg = (patch: TaskNoteMsgPatch) => {
      if (openNote.childId) store.updateSubTaskNote(openNote.taskId, openNote.childId, noteId, patch);
      else store.updateTaskNote(openNote.taskId, noteId, patch);
    };
    const sync = getActiveNoteSync();
    if (msg.kind === 'batch' || files.length > 1) {
      const items: NoteAttachmentItem[] = [];
      for (const file of files) {
        const imageId = newNoteImageId();
        if (sync) {
          const up = await uploadNoteFile(file, imageId);
          if (!up) continue;
          items.push({ kind: detectNoteKind(file), imageId, remotePath: up.remotePath, remoteSha: up.sha, fileName: file.name, fileSize: file.size });
        } else {
          if (!(await saveNoteImage(imageId, file))) continue;
          items.push({ kind: detectNoteKind(file), imageId, fileName: file.name, fileSize: file.size });
        }
      }
      if (!items.length) return 'uploadFailed';
      patchMsg({ kind: 'batch' as const, items, imageId: undefined, fileName: undefined, fileSize: undefined, remotePath: undefined, remoteSha: undefined });
    } else {
      const file = files[0];
      const imageId = newNoteImageId();
      if (sync) {
        const up = await uploadNoteFile(file, imageId);
        if (!up) return 'uploadFailed';
        patchMsg({ kind: detectNoteKind(file), imageId, remotePath: up.remotePath, remoteSha: up.sha, fileName: file.name, fileSize: file.size });
      } else {
        if (!(await saveNoteImage(imageId, file))) return 'uploadFailed';
        patchMsg({ kind: detectNoteKind(file), imageId, fileName: file.name, fileSize: file.size });
      }
    }
    oldFiles.forEach(deleteAttachmentData);
    return null;
  };

  const changeNewTask = (v: string) => {
    newTaskRef.current = v;
    setNewTask(v);
  };

  const submitNewTask = () => {
    const draft = newTaskRef.current;
    if (!draft.trim()) return;
    store.addTask(draft);
    changeNewTask('');
  };

  const changeGroupName = (v: string) => {
    groupNameRef.current = v;
    setGroupName(v);
  };

  const submitGroup = () => {
    const draft = groupNameRef.current;
    if (!draft.trim()) return;
    store.addTaskGroup(draft);
    changeGroupName('');
    setShowGroupForm(false);
  };

  /** 输入框回车显式提交（第五十七轮，同 GroupBlock 子任务框的口径）：
   * 输入法组合中的回车只上屏；组合结束后的回车直接提交并挡掉表单隐式提交防重复 */
  const enterToSubmit = (submit: () => void) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const checkBtn = (done: boolean, onToggle: () => void, label: string) => (
    <button
      type="button"
      aria-label={label}
      onClick={onToggle}
      className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${
        done ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/50 hover:border-indigo-300 text-transparent'
      }`}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );

  /** 标题编辑框：默认提交顶层条目；小组子任务传入自己的 commit/cancel（2026-11-20） */
  const titleEditor = (
    commit: () => void = commitEditTask,
    cancel: () => void = () => setEditingTaskId(null),
  ) => (
    <input
      value={editText}
      autoFocus
      onChange={(e) => setEditText(e.target.value)}
      onKeyDown={(e) => {
        // 输入法组合中的回车只上屏，别把半成品标题提前提交（第五十七轮）
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit();
        if (e.key === 'Escape') cancel();
      }}
      onBlur={commit}
      className="flex-1 min-w-0 bg-white/5 border border-indigo-400/50 rounded-lg px-2 py-1 text-sm outline-none"
      data-task-edit-input
    />
  );

  /** 顶层行渲染：inOpen=true 的行（仅「未完成」区）参与拖拽（第五十四轮合并，2026-11-08 加换顺序）——
   * 带 data-task-entry 落点标记与行身起手；已完成区行不带标记、不可拖；
   * 换顺序落点（drag.insertAt）在目标行前/后现一条插入线 */
  const taskRow = (task: TaskItem, inOpen: boolean) => {
    const dragVisual: 'source' | 'over' | null =
      drag.dragId === task.id ? 'source' : drag.overId === task.id ? 'over' : null;
    const insertLine = (position: 'before' | 'after') =>
      drag.insertAt?.id === task.id && drag.insertAt.position === position ? (
        <div key={`insert-${position}`} className="h-[3px] mx-1.5 rounded-full bg-indigo-400" />
      ) : null;
    return isTaskGroup(task) ? (
      <Fragment key={task.id}>
        {insertLine('before')}
      <GroupBlock
        group={task}
        store={store}
        startExpanded={!taskGroupDone(task)}
        editing={editingTaskId === task.id}
        editor={titleEditor()}
        onMenu={(e) => openMenu(e, 'taskGroup', task.id, task.title)}
        onChildMenu={(e, childId, childTitle) => openMenu(e, 'taskChild', childId, childTitle, task.id)}
        onTitleDoubleClick={() => {
          if (drag.wasJustDragged()) return;
          startEditTask(task);
        }}
        editingChildId={editingChild?.groupId === task.id ? editingChild.childId : null}
        childEditor={titleEditor(commitEditChild, () => setEditingChild(null))}
        onChildDoubleClick={(child) => {
          if (drag.wasJustDragged()) return;
          startEditChild(task.id, child);
        }}
        onTitleOpenNote={() => openNoteFor({ taskId: task.id })}
        onChildOpenNote={(child) => openNoteFor({ taskId: task.id, childId: child.id })}
        checkBtn={checkBtn}
        entryId={inOpen ? task.id : undefined}
        dragVisual={inOpen ? dragVisual : null}
        onGripPointerDown={inOpen ? (e) => drag.beginTaskDrag(e, task) : undefined}
        dragChildId={inOpen ? drag.dragId : null}
        onChildPointerDown={inOpen ? (e, child) => drag.beginChildDrag(e, task, child) : undefined}
        wasJustDragged={drag.wasJustDragged}
        onDeleteSelf={inOpen ? undefined : () => deleteTaskCascade(task.id)}
        onDeleteChild={inOpen ? undefined : (childId) => deleteSubTaskCascade(task.id, childId)}
      />
        {insertLine('after')}
      </Fragment>
    ) : (
      <Fragment key={task.id}>
        {insertLine('before')}
      <div
        data-task-row
        data-task-entry={inOpen ? task.id : undefined}
        onPointerDown={inOpen ? (e) => drag.beginTaskDrag(e, task) : undefined}
        onContextMenu={(e) => openMenu(e, 'task', task.id, task.title)}
        className={`flex items-center gap-2.5 px-1.5 py-[3px] rounded-xl min-w-0 ${
          dragVisual === 'over'
            ? 'bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/60'
            : 'hover:bg-white/[0.04]'
        } ${dragVisual === 'source' ? 'opacity-40' : ''}`}
      >
        {checkBtn(task.done, () => store.toggleTask(task.id), task.done ? t('task.unmarkDone') : t('task.markDone'))}
        {editingTaskId === task.id ? (
          titleEditor()
        ) : (
          <>
          <ExpandableTitle
            text={task.title}
            expanded={expandedTitles.has(task.id)}
            onToggle={() => toggleTitle(task.id)}
            onDoubleClick={() => {
              if (drag.wasJustDragged()) return;
              startEditTask(task);
            }}
            onOpenNote={() => openNoteFor({ taskId: task.id })}
            titleAttr={expandedTitles.has(task.id) ? t('task.clickCollapse') : t('task.clickExpand')}
            sizeClass="text-sm"
            toneClass={task.done ? 'line-through text-white/35' : 'text-white/85'}
            spanData={{ 'data-task-title': '' }}
          />
          <NoteAttachIcon notes={task.notes} />
          </>
        )}
        {!inOpen && editingTaskId !== task.id && (
          <DoneTrashButton label={t('task.deleteDoneTodo', { title: task.title })} onDelete={() => deleteTaskCascade(task.id)} />
        )}
      </div>
        {insertLine('after')}
      </Fragment>
    );
  };

  const listSection = (
    <section className={`${pinned ? 'flex flex-col h-full min-h-0' : ''} ${wide ? 'flex-1 min-w-0' : ''} relative`}>
      {/* 标题行（第八十七轮）：计数去掉（卡头 x/y 已含）；「+ 建组」降为行右小文字按钮 */}
      <div className="flex items-center gap-2 mb-1 shrink-0">
        <h4 className="text-sm font-semibold">{t('task.todosTitle')}</h4>
        {!showGroupForm && (
          <button
            type="button"
            data-group-new
            onClick={() => setShowGroupForm(true)}
            className="ml-auto text-[11px] leading-none px-1.5 py-1 rounded-md text-zinc-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            {t('task.newGroup')}
          </button>
        )}
      </div>
      {/* 列表区：pinned 时自成滚动区吃满列高（空状态不再单列文案，提示在底部输入框占位里） */}
      <div
        data-task-col-scroll={pinned ? 'tasks' : undefined}
        className={pinned ? 'flex-1 min-h-0 overflow-y-auto' : undefined}
      >
      <div data-nodrag ref={drag.listRef}>
        {openEntries.map((t) => taskRow(t, true))}
      </div>
      {doneEntries.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            data-done-header
            onClick={() => setShowDone((v) => !v)}
            onContextMenu={(e) => {
              // 右键只出本菜单：拦掉卡片级（尺寸/换底色）与主页空白右键菜单；左键折叠行为不变
              e.preventDefault();
              e.stopPropagation();
              setDoneMenu(rowMenuPosition(e));
            }}
            className="flex items-center gap-1.5 px-1.5 py-1 text-xs text-zinc-300 hover:text-white transition-colors"
          >
            <ChevronDown size={13} className={`transition-transform ${showDone ? '' : '-rotate-90'}`} />
            {t('task.doneCount', { n: doneEntries.length })}
          </button>
          {showDone && <div data-nodrag>{doneEntries.map((t) => taskRow(t, false))}</div>}
        </div>
      )}
      </div>
      {/* 底部块（第八十七轮）：pinned 时钉在列底——建组表单（开时）在添加框上方展开，添加框恒在最底 */}
      <div className={pinned ? 'shrink-0 pt-2 flex flex-col gap-2' : 'mt-2.5 flex flex-col gap-2'}>
      {/* 建组表单：组用来收纳一组相关的子任务（如一次采购清单）；入口已降为标题行小按钮 */}
      {showGroupForm && (
          <form
            ref={groupConfirm.setEl}
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              submitGroup();
            }}
            onBlur={(e) => {
              // 点表单外 = 确认（第七十五轮）：有组名就建组，空名直接收起（不产生空组）
              if (!groupConfirm.consumeBlur(e)) return;
              if (groupNameRef.current.trim()) submitGroup();
              else setShowGroupForm(false);
            }}
          >
            <input
              value={groupName}
              autoFocus
              onChange={(e) => changeGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setShowGroupForm(false);
                else enterToSubmit(submitGroup)(e);
              }}
              placeholder={t('task.groupNamePlaceholder')}
              data-group-name
              className="flex-1 min-w-0 bg-white/5 border border-white/12 rounded-xl px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400/50 placeholder:text-zinc-400"
            />
            <button
              type="submit"
              disabled={!groupName.trim()}
              data-group-create
              className="px-3 py-1.5 rounded-lg bg-indigo-500/80 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium transition-colors shrink-0"
            >
              {t('task.createGroup')}
            </button>
            <button
              type="button"
              onClick={() => setShowGroupForm(false)}
              className="px-3 py-1.5 rounded-lg bg-white/8 text-white/70 text-xs hover:bg-white/12 transition-colors shrink-0"
            >
              {t('task.cancel')}
            </button>
          </form>
        )}
      {/* 添加待办框（第一百零五轮）：与右侧「+ 新计划」统一为虚线款——虚线边、透明底、
          同圆角 rounded-xl、同高（边框 2 + 输入 py-1 + 文本行高 = 30px，与按钮一致） */}
      <form
        className="flex items-center gap-1.5 border border-dashed border-white/25 rounded-xl pl-2.5 pr-1.5 hover:border-white/45 focus-within:border-indigo-400/50 transition-colors"
        onSubmit={(e) => {
          e.preventDefault();
          submitNewTask();
        }}
      >
        <Plus size={14} className="text-zinc-300 shrink-0" />
        <input
          value={newTask}
          onChange={(e) => changeNewTask(e.target.value)}
          onKeyDown={enterToSubmit(submitNewTask)}
          onBlur={submitNewTask}
          placeholder={t('task.addTodoPlaceholder')}
          data-task-add
          className="flex-1 min-w-0 bg-transparent text-sm py-1 outline-none placeholder:text-zinc-400"
        />
      </form>
      </div>

      {/* 行右键菜单（编辑/删除，删除在菜单内两步确认） */}
      {menu && (
        <RowContextMenu
          state={menu}
          onClose={() => setMenu(null)}
          onPick={(action) => {
            if (action === 'edit') {
              const task = tasks.find((t) => t.id === menu.id);
              if (task) {
                // 在已完成区里的条目要先展开该区，就地编辑框才看得见
                if (taskEntryDone(task)) setShowDone(true);
                startEditTask(task);
              }
            } else if (action === 'delete') {
              if (menu.kind === 'taskChild' && menu.parentId) deleteSubTaskCascade(menu.parentId, menu.id);
              else deleteTaskCascade(menu.id);
            } else if (action === 'ungroup') {
              store.ungroupTask(menu.id);
            }
            setMenu(null);
          }}
        />
      )}

      {/* 「已完成」分组头右键菜单（第四十八轮）：一键清空，不加二次确认（文案写明「全部」防误解） */}
      {doneMenu && (
        <DoneClearMenu
          x={doneMenu.x}
          y={doneMenu.y}
          count={doneEntries.length}
          onClose={() => setDoneMenu(null)}
          onConfirm={() => {
            const doomed = tasks.filter(taskEntryDone).flatMap(collectTaskNoteFiles);
            tasks.forEach((t) =>
              (t.children ?? [])
                .filter((c) => c.done)
                .forEach((c) =>
                  doomed.push(
                    ...(c.notes ?? []).flatMap((n): { imageId?: string; remotePath?: string; remoteSha?: string }[] =>
                      n.kind === 'batch' ? (n.items ?? []) : [n],
                    ),
                  ),
                ),
            );
            store.clearCompletedTasks();
            doomed.forEach(deleteAttachmentData);
            setDoneMenu(null);
          }}
        />
      )}

      {/* 拖拽合并的跟随浮层（第五十四轮）：被拖条目的标题片，视觉语言同主页拖影（深底+亮环+抬升阴影） */}
      {drag.clone && (
        <div
          ref={drag.cloneRef}
          data-task-drag-clone
          className="fixed left-0 top-0 z-[95] pointer-events-none will-change-transform"
          style={{ width: drag.clone.w }}
        >
 <div className="flex items-center gap-2 rounded-xl bg-[#23232c] px-3 py-2 ring-1 ring-white/25 opacity-95">
            {drag.clone.isGroup ? (
              <Layers size={13} className="text-zinc-300 shrink-0" />
            ) : (
              <span className="w-[18px] h-[18px] rounded-[5px] border border-white/50 shrink-0" />
            )}
            <span className="flex-1 min-w-0 truncate text-sm text-white/90">{drag.clone.title}</span>
          </div>
        </div>
      )}

      {/* 窄栏笔记浮层（2026-11-20）：盖在待办列上；宽栏用右栏常驻，不走这里 */}
      {!wide && openNote && (
        <div className="absolute inset-0 z-20 flex flex-col rounded-xl bg-[#1d1d24] border border-white/10 overflow-hidden">
          <TaskNotePane
            title={openNoteTitle}
            notes={openNoteNotes}
            onSendText={sendNoteText}
            onSendFiles={sendNoteFiles}
            onDeleteNote={deleteNoteMsg}
            onEditText={editNoteText}
            onReplaceFiles={replaceNoteFiles}
            allFiles={allNoteFiles}
            onDeleteNoteFile={deleteNoteFile}
            onJumpToNote={jumpToNote}
            onClose={() => setOpenNote(null)}
            localOnlyCount={localOnlyFiles.length}
            migrating={migrating}
            onMigrate={getActiveNoteSync() ? migrateLocalFiles : null}
            className="flex-1"
          />
        </div>
      )}
    </section>
  );

  /** 宽栏（2026-11-20）：左栏标题列表、右栏笔记内容常驻两栏；窄栏只出待办列，笔记走浮层 */
  if (wide) {
    return (
      <div className={`flex gap-3 min-h-0 ${pinned ? 'flex-1' : 'items-start'}`}>
        {listSection}
        <TaskNotePane
          title={openNoteTitle}
          notes={openNoteNotes}
          onSendText={sendNoteText}
          onSendFiles={sendNoteFiles}
          onDeleteNote={deleteNoteMsg}
          onEditText={editNoteText}
          onReplaceFiles={replaceNoteFiles}
          allFiles={allNoteFiles}
          onDeleteNoteFile={deleteNoteFile}
          onJumpToNote={jumpToNote}
          onClose={() => setOpenNote(null)}
          localOnlyCount={localOnlyFiles.length}
          migrating={migrating}
          onMigrate={getActiveNoteSync() ? migrateLocalFiles : null}
          className={
            pinned
              ? 'flex-1 min-w-0 rounded-2xl border border-white/10 bg-white/[0.03]'
              : 'w-1/2 shrink-0 sticky top-4 h-[600px] rounded-2xl border border-white/10 bg-white/[0.03]'
          }
        />
      </div>
    );
  }
  return listSection;
}
/** 组块：标题行（展开箭头 + 标题 + n/m）+ 子任务列表 + 组内添加行；全勾时标题划线。
 * 拖拽合并（第五十四轮）：entryId 存在时整块是落点（[data-task-entry]），头部行是起手区
 * （[data-task-grip]，子任务行与组内添加表单不作起手）；dragVisual 渲染源行半透明/落点高亮 */
const GroupBlock: React.FC<{
  group: TaskItem;
  store: LocalStore;
  startExpanded: boolean;
  editing: boolean;
  editor: React.ReactNode;
  onMenu: (e: React.MouseEvent) => void;
  onChildMenu: (e: React.MouseEvent, childId: string, childTitle: string) => void;
  checkBtn: (done: boolean, onToggle: () => void, label: string) => React.ReactNode;
  entryId?: string;
  dragVisual?: 'source' | 'over' | null;
  onGripPointerDown?: (e: React.PointerEvent) => void;
  /** 正在被拖出的子任务 id（2026-11-08）：对应子任务行半透明 */
  dragChildId?: string | null;
  /** 组内子任务行身起手（2026-11-08）：拖动单个项目把它拖出去 */
  onChildPointerDown?: (e: React.PointerEvent, child: TaskChild) => void;
  /** 合并拖拽刚结束守卫（第六十九轮，理由同 TasksSection 的 toggleTitle） */
  wasJustDragged?: () => boolean;
  /** 已完成区专用（第七十五轮）：组本身与子任务行尾的垃圾桶删除；仅 TasksSection 在已完成区传入 */
  onDeleteSelf?: () => void;
  onDeleteChild?: (childId: string) => void;
  /** 组标题双击改名（与右键菜单改名同走 editing/editor） */
  onTitleDoubleClick?: () => void;
  /** 正在双击编辑的子任务 id（2026-11-20） */
  editingChildId?: string | null;
  /** 子任务标题编辑框（与组标题 editor 同款输入框，走 renameSubTask 提交） */
  childEditor?: React.ReactNode;
  /** 子任务标题双击改名（2026-11-20） */
  onChildDoubleClick?: (child: TaskChild) => void;
  /** 组标题单击开笔记（2026-11-20） */
  onTitleOpenNote?: () => void;
  /** 子任务标题单击开笔记（2026-11-20） */
  onChildOpenNote?: (child: TaskChild) => void;
}> = ({ group, store, startExpanded, editing, editor, onMenu, onChildMenu, checkBtn, entryId, dragVisual, onGripPointerDown, dragChildId, onChildPointerDown, wasJustDragged, onDeleteSelf, onDeleteChild, onTitleDoubleClick, editingChildId, childEditor, onChildDoubleClick, onTitleOpenNote, onChildOpenNote }) => {
  const [expanded, setExpanded] = useState(startExpanded);
  const { t } = useLang();
  /** 组标题/子任务标题的点击展开全文（第六十九轮，点文字切换，与展开箭头的折叠子任务互不影响） */
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [expandedKids, setExpandedKids] = useState<ReadonlySet<string>>(new Set());
  const kids = group.children ?? [];
  const { done, total } = taskChildProgress(group);
  const allDone = taskGroupDone(group);

  return (
    <div
      data-task-group
      data-task-entry={entryId}
      className={`rounded-xl px-1.5 py-[3px] ${
        dragVisual === 'over' ? 'bg-indigo-500/15 ring-1 ring-inset ring-indigo-400/60' : 'hover:bg-white/[0.04]'
      } ${dragVisual === 'source' ? 'opacity-40' : ''}`}
      onContextMenu={onMenu}
    >
      <div className="flex items-center gap-2 min-w-0" data-task-grip onPointerDown={onGripPointerDown}>
        <button
          type="button"
          aria-label={expanded ? t('task.collapseGroup') : t('task.expandGroup')}
          data-group-toggle
          onClick={() => setExpanded((v) => !v)}
          className="w-[18px] h-[18px] flex items-center justify-center shrink-0 text-zinc-300 hover:text-white transition-colors"
        >
          <ChevronDown size={14} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
        </button>
        {editing ? (
          editor
        ) : (
          <>
            <ExpandableTitle
              text={group.title}
              expanded={titleExpanded}
              onToggle={() => {
                if (wasJustDragged?.()) return;
                setTitleExpanded((v) => !v);
              }}
              onDoubleClick={onTitleDoubleClick}
              onOpenNote={onTitleOpenNote}
              titleAttr={titleExpanded ? t('task.clickCollapse') : t('task.clickExpand')}
              sizeClass="text-sm font-medium"
              toneClass={allDone ? 'line-through text-white/35' : 'text-white/90'}
              spanData={{ 'data-group-title': '' }}
            />
            <NoteAttachIcon notes={group.notes} />
            <span data-group-progress className="text-[11px] text-zinc-300 tabular-nums shrink-0">
              {done}/{total}
            </span>
            {onDeleteSelf && (
              <DoneTrashButton label={t('task.deleteDoneGroup', { title: group.title })} onDelete={onDeleteSelf} />
            )}
          </>
        )}
      </div>
      {expanded && (
        <div className="mt-0.5 ml-[26px] flex flex-col">
          {kids.length === 0 && (
            <p className="text-xs text-zinc-300 py-1.5">{t('task.groupEmpty')}</p>
          )}
          {kids.map((child) => (
            <div
              key={child.id}
              data-subtask-row
              data-subtask-id={child.id}
              onPointerDown={onChildPointerDown ? (e) => onChildPointerDown(e, child) : undefined}
              onContextMenu={(e) => {
                e.stopPropagation();
                onChildMenu(e, child.id, child.title);
              }}
              className={`flex items-center gap-2.5 py-[3px] min-w-0 ${dragChildId === child.id ? 'opacity-40' : ''}`}
            >
              {checkBtn(child.done, () => store.toggleSubTask(group.id, child.id), child.done ? t('task.unmarkDone') : t('task.markDone'))}
              {editingChildId === child.id ? (
                childEditor
              ) : (
              <>
              <ExpandableTitle
                text={child.title}
                expanded={expandedKids.has(child.id)}
                onToggle={() => {
                  if (wasJustDragged?.()) return;
                  setExpandedKids((prev) => {
                    const next = new Set(prev);
                    if (next.has(child.id)) next.delete(child.id);
                    else next.add(child.id);
                    return next;
                  });
                }}
                onDoubleClick={() => onChildDoubleClick?.(child)}
                onOpenNote={() => onChildOpenNote?.(child)}
                titleAttr={expandedKids.has(child.id) ? t('task.clickCollapse') : t('task.clickExpand')}
                sizeClass="text-[13px]"
                toneClass={child.done ? 'line-through text-white/35' : 'text-white/80'}
                spanData={{ 'data-subtask-title': '' }}
              />
              <NoteAttachIcon notes={child.notes} />
              </>
              )}
              {onDeleteChild && (
                <DoneTrashButton label={t('task.deleteDoneSubtask', { title: child.title })} onDelete={() => onDeleteChild(child.id)} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};



/**
 * 已完成行尾垃圾桶（第七十五轮）：已完成区里的组/普通待办/子任务行尾自动出现，
 * 点一下删除该行。确认口径同行右键菜单删除——两步确认（垃圾桶 → 行内「确认删除/算了」），
 * 不裸删；计数（x/y、n/m）随 store 更新自然刷新，按钮在计数之后、不挤占标题行
 */
function DoneTrashButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const { t } = useLang();
  if (confirming) {
    return (
      <span className="flex items-center gap-1 shrink-0" data-done-trash-confirm>
        <button
          type="button"
          data-done-trash-yes
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="px-2 py-1 rounded-md bg-red-500/80 hover:bg-red-500 text-white text-[11px] font-medium transition-colors"
        >
          {t('task.confirmDelete')}
        </button>
        <button
          type="button"
          data-done-trash-no
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(false);
          }}
          className="px-2 py-1 rounded-md bg-white/8 hover:bg-white/12 text-white/70 text-[11px] transition-colors"
        >
          {t('task.neverMind')}
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-done-trash
      onClick={(e) => {
        e.stopPropagation();
        setConfirming(true);
      }}
      className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 text-white/35 hover:text-red-300 hover:bg-red-500/10 transition-colors"
    >
      <Trash2 size={13} />
    </button>
  );
}

/** 「已完成」分组头右键菜单（第四十八轮）：与行菜单同壳同关闭范式，只一项「删除全部已完成项」 */
function DoneClearMenu({
  x,
  y,
  count,
  onClose,
  onConfirm,
}: {
  x: number;
  y: number;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useLang();

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-done-clear-menu
 className="fixed z-[90] w-[196px] rounded-2xl bg-[#1e1e26] border border-white/15 p-1.5"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        // 菜单上再右键不另开菜单（2026-11-20）
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        data-done-clear-action
        onClick={onConfirm}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-red-300 hover:bg-red-500/10 transition-colors"
      >
        <Trash2 size={13} /> {t('task.clearAllDone', { count })}
      </button>
    </div>
  );
}

/** 行右键菜单：范式同 SiteContextMenu（实色、点外关闭、删除两步确认） */
function RowContextMenu({
  state,
  onClose,
  onPick,
}: {
  state: RowMenuState;
  onClose: () => void;
  onPick: (action: 'edit' | 'delete' | 'ungroup' | 'markDone' | 'unmarkDone') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);
  const { t } = useLang();

  useEffect(() => {
    setConfirming(false);
  }, [state]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onScroll = () => onClose();
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [onClose]);

  const itemCls =
    'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-white/75 hover:bg-white/8 hover:text-white transition-colors';
  const showEdit = state.kind !== 'taskChild';
  const deleteLabel = state.kind === 'taskGroup' ? t('task.deleteGroup') : t('task.delete');

  return (
    <div
      ref={ref}
      data-row-menu
 className="fixed z-[90] w-[172px] rounded-2xl bg-[#1e1e26] border border-white/15 p-1.5"
      style={{ left: state.x, top: state.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => {
        // 菜单上再右键不另开菜单（2026-11-20）
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {!confirming ? (
        <>
          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-medium text-white/55 truncate">{state.title}</p>
          {showEdit && (
            <button type="button" onClick={() => onPick('edit')} className={itemCls}>
              <Pencil size={13} className="text-white/45" /> {state.kind === 'taskGroup' ? t('task.rename') : t('task.edit')}
            </button>
          )}
          {state.kind === 'taskGroup' && (
            <button type="button" onClick={() => onPick('ungroup')} className={itemCls} data-menu-ungroup>
              <Ungroup size={13} className="text-white/45" /> {t('task.ungroup')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs text-red-300 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={13} /> {deleteLabel}
          </button>
        </>
      ) : (
        <>
          <p className="px-2.5 pt-1.5 pb-1.5 text-[11px] text-red-300 truncate">
            {state.kind === 'taskGroup' ? t('task.confirmDeleteGroup', { title: state.title }) : t('task.confirmDeleteItem', { title: state.title })}
          </p>
          <div className="flex gap-1.5 px-1 pb-1">
            <button
              type="button"
              onClick={() => onPick('delete')}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-red-500/80 text-white text-[11px] font-medium hover:bg-red-500 transition-colors"
            >
              {t('task.confirmDelete')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/8 text-white/70 text-[11px] hover:bg-white/12 transition-colors"
            >
              {t('task.neverMind')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** AI 整理视图：输入杂事 → 本地规则拆分预览（可勾选、可改字；计划可改目标数）→ 确认落库。
 * 第六十九轮起由计划卡卡面头部「AI 整理」按钮切换卡内视图承载（原在展开面板里） */
export function AiView({ store, onDone }: { store: LocalStore; onDone: () => void }) {
  const [text, setText] = useState('');
  const { t } = useLang();
  const [preview, setPreview] = useState<{
    todos: { title: string; checked: boolean }[];
  } | null>(null);

  const runSplit = () => {
    const result = splitTasksText(text);
    // 长期计划分类已删除（2026-10-26 用户定）：拆出的长期事项不再单独立项，直接并入待办，
    // 预览只有一组合并列表，确认后全部落库为待办
    setPreview({
      todos: [
        ...result.todos.map((title) => ({ title, checked: true })),
        ...result.plans.map((p) => ({ title: p.title, checked: true })),
      ],
    });
  };

  const confirm = () => {
    if (!preview) return;
    store.addSplitResult(
      preview.todos.filter((t) => t.checked).map((t) => t.title),
      [],
    );
    setText('');
    setPreview(null);
    onDone();
  };

  const checkedCount = preview ? preview.todos.filter((t) => t.checked).length : 0;

  const checkBox = (checked: boolean, onToggle: () => void) => (
    <button
      type="button"
      aria-label={checked ? t('ai.skipAdd') : t('ai.addItem')}
      onClick={onToggle}
      className={`w-[18px] h-[18px] rounded-[5px] border flex items-center justify-center shrink-0 transition-colors ${
        checked ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-white/50 hover:border-indigo-300 text-transparent'
      }`}
    >
      <Check size={12} strokeWidth={3} />
    </button>
  );

  return (
    <div className="overflow-y-auto min-h-0 flex-1" data-ai-view>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setPreview(null);
        }}
        placeholder={t('ai.splitPlaceholder')}
        rows={4}
        autoFocus
        data-ai-input
        className="w-full bg-white/5 border border-white/12 rounded-2xl px-3.5 py-3 text-sm leading-relaxed outline-none focus:border-indigo-400/50 placeholder:text-zinc-400 resize-none"
      />
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={runSplit}
          disabled={!text.trim()}
          data-ai-split
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500/80 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
        >
          <Sparkles size={14} /> {t('ai.split')}
        </button>
        <p className="text-[11px] text-zinc-400 leading-relaxed">{t('ai.splitNote')}</p>
      </div>

      {preview && (
        <div className="mt-4">
          {preview.todos.length === 0 ? (
            <p className="text-sm text-zinc-300 py-2">{t('ai.splitEmpty')}</p>
          ) : (
            <>
              {preview.todos.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-zinc-300 mb-1.5">{t('ai.splitTodos', { n: preview.todos.length })}</p>
                  <div className="flex flex-col">
                    {preview.todos.map((item, i) => (
                      <div key={i} data-ai-todo className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-white/[0.04]">
                        {checkBox(item.checked, () =>
                          setPreview((p) =>
                            p ? { ...p, todos: p.todos.map((t, j) => (j === i ? { ...t, checked: !t.checked } : t)) } : p,
                          ),
                        )}
                        <input
                          value={item.title}
                          onChange={(e) =>
                            setPreview((p) =>
                              p ? { ...p, todos: p.todos.map((t, j) => (j === i ? { ...t, title: e.target.value } : t)) } : p,
                            )
                          }
                          className="flex-1 min-w-0 bg-transparent text-sm py-1 outline-none border-b border-transparent focus:border-indigo-400/50 text-white/85"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={confirm}
                disabled={checkedCount === 0}
                data-ai-confirm
                className="px-4 py-2 rounded-xl bg-indigo-500/80 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
              >
                {t('ai.confirmAdd', { n: checkedCount })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
