import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Pin, Pencil, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { GROUP_NAME_MAX, siteIconSrc, sortSites, textCharCount, type NavGroup } from '../../data/groups';
import type { LocalStore } from '../../store/localStore';
import { SiteLogo } from './Card';
import GroupExpandedBody, { SiteTagBadges } from './GroupExpanded';
import SwipeableRow from './SwipeableRow';
import { useSiteDragSort } from './useSiteDragSort';

/**
 * B 型 · 编组列表卡（收起态占格由右键布局决定：默认 2 栏 × 2x）
 * 站点行式排布（图标 + 名称 + 一句介绍 + 标签，同旧站 AI 导航）。
 * 收起只显示站点：可见数按布局算（栏数 × 每列行数，2x 每列 5 行、1x 每列 2 行）。
 * 展开 / 收起入口（第十六轮修正，整卡单击太容易误触）：头部组名后的小胶囊按钮——收起态显示「展开」、展开态显示「收起」
 * （第三十/三十一轮最终形态；第十六轮的卡底渐隐提示条与卡底展开小按钮、第三十轮前的卡底收起条均已退役）。
 * 单击卡面空白处不展开也不收起，点站点行仍是打开网站。
 * 第三十七轮新增第二入口：双击卡面「空白区域」也能切换展开/收起（不恢复单击展开）。
 * 空白 = 卡身背景、内边距、行间间隙、标题行空白等非交互区域；双击落在 button / a / input 等交互元素、
 * 编辑控件或 data-no-dblclick 标记上的一律忽略；刚拖拽完（松手移动超阈值）的手势不顺带触发双击切换。
 * 展开后站点在卡内滚动区域里继续以行式呈现，末尾有虚线「增加网站」格子。
 * 第十二轮头部调整：标题行 = 组名 +「· N 个站点」小字（原右上角「编组 · N 个站点」已删除）；该计数第三十轮已删除，收起态标题行同样不带计数；
 * 展开态的组操作（改组名 / 删组 / 详细列表↔文件夹式切换）上移到标题行右侧，与组名同一行。
 * 第十六轮：收起态可见数按布局（栏数 × 高度行数）计算，溢出时卡底渐隐 +「还有 N 个站点」提示。
 * 第二十轮：2 栏宽时收起态网格也统一 3 列（与展开态一致，用户明确不要收起时 2 列）；1 栏保持单列。
 */
export default function GroupListCard({
  group,
  expanded,
  onToggleExpand,
  store,
  colSpan = 2,
  heightUnits = 2,
  delay = 0,
}: {
  group: NavGroup;
  expanded: boolean;
  onToggleExpand: (group: NavGroup) => void;
  store: LocalStore;
  /** 收起态宽度（右键布局）：1 栏时站点单列；2 栏时 3 列（第二十轮，与展开态统一） */
  colSpan?: 1 | 2;
  /** 收起态高度（右键布局）：2x 每列 5 行；1x 每列 2 行——实际可见数按此计算，溢出提示的 N 才准确 */
  heightUnits?: 1 | 2;
  delay?: number;
}) {
  const sorted = sortSites(group.sites);
  const cols = colSpan === 1 ? 1 : 3;
  const rowsPerCol = heightUnits === 2 ? 5 : 2;
  const visibleCount = cols * rowsPerCol;
  const rows = sorted.slice(0, visibleCount);

  // 收起态跨组拖拽（随时按住都可拖）：收起网格本身无组内排序语义，只做跨组移动；
  // 拖到别的组卡松手即 moveSite，同组/空白取消；展开体不接跨组、行为不变
  const crossDrag = useSiteDragSort({
    sites: sorted,
    groupId: group.id,
    crossGroupOnly: true,
    onMoveToGroup: (siteId, targetGroupId) => store.moveSite(group.id, siteId, targetGroupId),
  });

  // 展开态组操作（原在展开体顶部一行，第十二轮上提到标题行）
  const [renaming, setRenaming] = useState(false);
  const [groupName, setGroupName] = useState(group.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** 收起态行左滑（第七十三轮）：当前打开操作条的行 + 左滑「编辑」直达请求（展开后由展开体消费） */
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null);
  const [editRequestId, setEditRequestId] = useState<string | null>(null);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  /* ---------- 双击空白展开/收起（第三十七轮） ----------
   * 拖拽抑制（与 HomePage 拖拽的 click 抑制同思路、按双击手势本身判定）：
   * 卡根记录每次左键按下的起止位移（阈值与 HomePage 拖拽判定一致，8px）；
   * dblclick 到达时看「组成这次双击的最近两次按下」——任一次发生过拖拽位移就忽略
   * （典型场景：第一下单击、第二下按住拖走松手，浏览器仍可能凑出一个 dblclick）。
   * 拖拽结束后再做一次干净的双击，两次按下都没位移，不受此抑制影响。
   * 两个指针处理器只做记录、不拦截冒泡，HomePage 包装层的拖拽排序照常工作。 */
  const DRAG_MOVE_THRESHOLD = 8;
  const pressStartRef = useRef<{ x: number; y: number } | null>(null);
  const pressHistoryRef = useRef<{ t: number; moved: boolean }[]>([]);

  const trackPressStart = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pressStartRef.current = { x: e.clientX, y: e.clientY };
  };
  const trackPressEnd = (e: React.PointerEvent) => {
    const start = pressStartRef.current;
    pressStartRef.current = null;
    if (!start) return;
    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_MOVE_THRESHOLD;
    pressHistoryRef.current = [...pressHistoryRef.current.slice(-5), { t: Date.now(), moved }];
  };

  const handleCardDoubleClick = (e: React.MouseEvent) => {
    // 组成这次双击的两次按下里有一次是拖拽 → 是拖拽手势的尾巴，不切换
    const now = Date.now();
    const pair = pressHistoryRef.current.filter((r) => now - r.t < 1500).slice(-2);
    if (pair.length === 2 && pair.some((r) => r.moved)) return;
    // 只认空白区域：交互元素（站点行/链接/胶囊按钮/表单/右键菜单项等）与显式标记上一律忽略
    const t = e.target as HTMLElement;
    if (t.closest('button, a, input, textarea, select, label, [contenteditable="true"], [data-no-dblclick]')) return;
    e.preventDefault(); // 避免双击顺带选中卡内文字
    onToggleExpand(group);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      onPointerDown={trackPressStart}
      onPointerUp={trackPressEnd}
      onDoubleClick={handleCardDoubleClick}
      className="group-card-panel group-card-panel-hover relative rounded-[28px] h-full p-4 sm:p-5 flex flex-col overflow-hidden transition-colors"
    >
      {/* 标题行：组名（展开时其后跟「收起」胶囊按钮）；展开时右侧同行放组操作（标题行内点击不触发卡片展开/收起） */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 mb-2 shrink-0" onClick={expanded ? stop : undefined}>
        {expanded && renaming ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="relative block">
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                autoFocus
                maxLength={GROUP_NAME_MAX}
                data-group-name-input
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && groupName.trim()) {
                    store.renameGroup(group.id, groupName.trim());
                    setRenaming(false);
                  }
                }}
                className="w-40 bg-white/5 border border-white/15 rounded-xl px-3 py-1.5 pr-10 text-sm outline-none focus:border-indigo-400/60"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">
                {textCharCount(groupName)}/{GROUP_NAME_MAX}
              </span>
            </span>
            <button
              onClick={() => {
                if (groupName.trim()) store.renameGroup(group.id, groupName.trim());
                setRenaming(false);
              }}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-500/80 text-white shrink-0"
            >
              保存
            </button>
            <button onClick={() => setRenaming(false)} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/10 text-white/70 shrink-0">
              取消
            </button>
          </span>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="font-semibold text-base sm:text-lg tracking-tight truncate">{group.name}</h3>
              {/* 组名后唯一的小胶囊按钮（第三十/三十一轮最终形态）：收起态 =「展开」、展开态 =「收起」，同位置同样式；
                  「· N 个站点」计数已删，卡底部不再有任何展开/收起条（第十六轮底部渐隐提示条与卡底展开小按钮就此退役） */}
              <button
                type="button"
                {...(expanded ? { 'data-collapse-btn': true } : { 'data-expand-btn': true })}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpand(group);
                }}
                className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-full px-3 py-1 transition-colors cursor-pointer shrink-0"
              >
                {expanded ? (
                  <>收起 <ChevronUp size={13} /></>
                ) : (
                  <>展开 <ChevronDown size={13} /></>
                )}
              </button>
            </div>
            {expanded && (
              <span className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => {
                    setGroupName(group.name);
                    setRenaming(true);
                  }}
                  className="flex items-center gap-1 text-[11px] text-white/45 hover:text-white/80 transition-colors"
                >
                  <Pencil size={11} /> 改组名
                </button>
                {confirmDelete ? (
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-red-300">删除整个编组？</span>
                    <button onClick={() => store.deleteGroup(group.id)} className="px-2 py-1 rounded-md bg-red-500/80 text-white font-medium">
                      确认删除
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="px-2 py-1 rounded-md bg-white/8 text-white/70">
                      算了
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1 text-[11px] text-white/45 hover:text-red-300 transition-colors"
                  >
                    <Trash2 size={11} /> 删组
                  </button>
                )}
                {/* 形态切换：详细列表（B） ↔ 文件夹式（C） */}
                <span className="flex items-center rounded-lg bg-white/5 border border-white/10 overflow-hidden">
                  <button
                    onClick={() => store.setGroupDisplay(group.id, 'list')}
                    title="详细列表卡：在主页原地展开成行式列表"
                    className={`text-[11px] px-2.5 py-1 transition-colors ${
                      group.display === 'list' ? 'bg-indigo-500/70 text-white font-medium' : 'text-white/50 hover:text-white/85'
                    }`}
                  >
                    详细列表
                  </button>
                  <button
                    onClick={() => {
                      // 第一百一十二轮：此按钮只在展开态出现；切回 C 前先收起，
                      // 否则 expandedId 残留、之后再切回 B 会再次自动展开
                      if (expanded) onToggleExpand(group);
                      store.setGroupDisplay(group.id, 'stack');
                    }}
                    title="文件夹式卡：紧凑堆叠卡，点开弹窗看图标"
                    className={`text-[11px] px-2.5 py-1 transition-colors ${
                      group.display === 'stack' ? 'bg-indigo-500/70 text-white font-medium' : 'text-white/50 hover:text-white/85'
                    }`}
                  >
                    文件夹式
                  </button>
                </span>
                {/* 失效链接汇总提示已按用户要求删除（第二十九轮）：站点行自身的「失效」徽标保留 */}
              </span>
            )}
          </>
        )}
      </div>

      {expanded ? (
        <GroupExpandedBody
          group={group}
          store={store}
          colSpan={colSpan}
          editRequestId={editRequestId}
          onEditRequestDone={() => setEditRequestId(null)}
        />
      ) : (
        /* 收起态：只显示站点（无底部横线、无「展开全部」字样、无底部渐隐）；展开靠头部组名后的「展开」按钮，不靠整卡点击 */
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">
          <div
            data-collapsed-grid
            data-cross-source
            className={`grid gap-x-2 content-start ${colSpan === 1 ? 'grid-cols-1' : 'grid-cols-1 min-[480px]:grid-cols-3'}`}
            onPointerDown={crossDrag.onContainerPointerDown}
            onDragStart={crossDrag.onContainerDragStart}
            onPointerDownCapture={(e) => {
              // 左滑操作条开着时，按到该行之外先收起（第七十三轮）
              if (!swipeOpenId) return;
              const row = (e.target as HTMLElement).closest('[data-swipe-row]');
              if (!row || row.getAttribute('data-swipe-row') !== swipeOpenId) setSwipeOpenId(null);
            }}
          >
            {rows.map((site) => (
              /* 左滑露出编辑/删除（第七十三轮）：横向认领在捕获阶段截断 move，主页整卡拖拽
                 的 pending 不会误激活；「编辑」= 展开本卡并直达该站点的编辑表单（既有编辑入口） */
              <React.Fragment key={site.id ?? site.name}>
              <SwipeableRow
                rowKey={site.id ?? site.name}
                openKey={swipeOpenId}
                onOpenKeyChange={setSwipeOpenId}
                gestureLock={crossDrag.isCrossActive}
                onDragEscape={(x, y) => crossDrag.activateCrossNow(x, y)}
                onEdit={() => {
                  if (!site.id) return;
                  setEditRequestId(site.id);
                  onToggleExpand(group);
                }}
                onDelete={() => {
                  if (site.id) store.deleteSite(group.id, site.id);
                }}
              >
                {(swipeGuard) => (
                  <button
                    data-site-drag-id={site.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (swipeGuard() || crossDrag.consumeSuppressClick()) return;
                      window.open(site.url, '_blank');
                    }}
                    className="flex items-center gap-2.5 px-2 py-[7px] w-full rounded-2xl hover:bg-white/6 text-left transition-colors"
                  >
                    <SiteLogo logo={siteIconSrc(site)} name={site.name} url={site.url} size={34} imgSize={23} grayscale={site.dead} />
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span className={`text-[13px] font-semibold truncate min-w-0 ${site.dead ? 'text-white/45' : ''}`}>{site.name}</span>
                        {site.pinned && <Pin size={11} className="text-amber-400 fill-amber-400 shrink-0" />}
                        {/* 标签徽标（第七十六轮）：从行尾挪到名字正后方、与图钉同区，最多 2 个 */}
                        <SiteTagBadges site={site} />
                        {site.dead && (
                          <span className="text-[9px] font-medium text-red-300 bg-red-500/15 px-1.5 py-0.5 rounded shrink-0">失效</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-white/45 truncate mt-0.5">{site.description}</span>
                    </span>
                  </button>
                )}
              </SwipeableRow>
              </React.Fragment>
            ))}
          </div>
          </div>
          {/* 收起态列表到底自然结束：底部渐隐提示条与卡底「展开」小按钮已删除（第三十一轮），展开入口统一在头部 */}
        </div>
      )}
      {crossDrag.dragLayer}
    </motion.div>
  );
}
