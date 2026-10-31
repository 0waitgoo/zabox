import React, { Suspense, useEffect, useState } from 'react';
import { ChevronLeft, ShieldCheck, Wrench, X } from 'lucide-react';
import { TOOL_DEFS, type ToolTabId } from '../tools/toolDefs';
import {
  closeToolsWorkspace,
  openToolsWorkspace,
  setToolsWorkspaceTool,
  useToolsWorkspace,
} from '../../store/toolsWorkspace';
import type { WidgetTint } from '../../store/localStore';
import { useLang } from '../../i18n/useLang';
import { Card, CardIconBadge } from './Card';

const PdfToImages = React.lazy(() => import('../tools/PdfToImages'));
const PdfToLongImage = React.lazy(() => import('../tools/PdfToLongImage'));
const ImagesToPdf = React.lazy(() => import('../tools/ImagesToPdf'));
const PdfToTxt = React.lazy(() => import('../tools/PdfToTxt'));
const PdfMerge = React.lazy(() => import('../tools/PdfMerge'));
const PdfSplit = React.lazy(() => import('../tools/PdfSplit'));

const COMPS: Record<ToolTabId, React.LazyExoticComponent<React.ComponentType<{ compact?: boolean }>>> = {
  images: PdfToImages,
  long: PdfToLongImage,
  img2pdf: ImagesToPdf,
  txt: PdfToTxt,
  merge: PdfMerge,
  split: PdfSplit,
};

/**
 * A 型 · 文件工具卡（第六十八轮建卡，第八十六轮并入工具本体）：
 * 独立工具页已删除，六个工具（PDF 转图片/转长图、图片转 PDF、PDF 转 TXT、
 * PDF 合并、PDF 拆分）整体搬进本卡：卡面摆 6 个瓷砖，点瓷砖就地进入该工具的
 * 工作区（选文件 → 设置 → 处理 → 下载全程不跳页），处理逻辑与设置项就是原
 * 工具页的那套实现（components/tools/，compact 紧凑呈现），全部浏览器本地
 * 处理、不上传。
 * 打开状态走 toolsWorkspace 外部 store：HomePage 据此把本卡（或含本卡的摞）
 * 的栏位高度抬到收起态的 2 倍原地变高（第一百零四轮 2x 口径，与第七十一轮编组卡展开同一套栏位机制）；
 * 顶栏扳手也经它发起「定位打开」请求。工作区首次打开后保持挂载、收起只
 * 隐藏——已选文件与处理结果不因收起/再打开丢失；切换工具则整块重挂载
 * （与原工具页切 tab 的语义一致，上一个工具的临时状态自然释放）。
 * 排布（瓷砖面，与第六十八轮一致）：2 栏×1x 一排 6 个；2 栏×2x 3 列×2 行；
 * 1 栏×1x 3 列×2 行（横排紧凑）；1 栏×2x 2 列×3 行。手机单列走 1 栏排布。
 */
export default function FileToolsCard({
  delay = 0,
  colSpan = 2,
  heightUnits = 1,
  tint,
}: {
  delay?: number;
  /** 右键布局宽度（决定排布列数） */
  colSpan?: 1 | 2;
  /** 右键布局高度：2x 时瓷砖放大排布 */
  heightUnits?: 1 | 2;
  /** 专属底色（由 HomePage 按 widgetTints 分配传入） */
  tint?: WidgetTint;
}) {
  const ws = useToolsWorkspace();
  /** 工作区是否曾经打开过：首次打开才挂载（懒加载工具实现），之后常驻保状态 */
  const [everOpened, setEverOpened] = useState(ws.open);
  const { t } = useLang();
  const toolLabel = (id: ToolTabId, fallback: string): string => {
    const key = `home.tool.${id}`;
    const translated = t(key);
    return translated === key ? fallback : translated;
  };
  useEffect(() => {
    if (ws.open) setEverOpened(true);
  }, [ws.open]);

  const gridCls =
    colSpan === 2
      ? heightUnits === 2
        ? 'grid-cols-3'
        : 'grid-cols-6'
      : heightUnits === 2
        ? 'grid-cols-2'
        : 'grid-cols-3';
  /** 2x 或宽卡用大瓷砖；1 栏 × 1x 高度只剩百余像素，瓷砖改横排（图标+名称同行）才不溢出 */
  const compact = colSpan === 1 && heightUnits === 1;

  const ActiveTool = COMPS[ws.tool];
  const activeDef = TOOL_DEFS.find((t) => t.id === ws.tool) ?? TOOL_DEFS[0];

  return (
    <Card
      title={t('home.toolsTitle')}
      icon={
        <CardIconBadge className="bg-indigo-500 text-white">
          <Wrench size={14} />
        </CardIconBadge>
      }
      right={
        ws.open ? (
          <button
            type="button"
            data-tools-close
            onClick={(e) => {
              e.stopPropagation();
              closeToolsWorkspace();
            }}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white shrink-0"
          >
            <X size={12} />
            {t('menu.collapse')}
          </button>
        ) : undefined
      }
      delay={delay}
      tint={tint}
      watermark="🧰"
    >
      {/* 瓷砖面：工作区打开时隐藏（状态无损，纯呈现切换） */}
      <div data-tools-grid className={`flex-1 min-h-0 grid ${gridCls} gap-2 ${ws.open ? 'hidden' : ''}`}>
        {TOOL_DEFS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              data-tool-link={t.id}
              aria-label={toolLabel(t.id, t.label)}
              onClick={(e) => {
                e.stopPropagation();
                openToolsWorkspace(t.id);
              }}
              className={`min-h-0 min-w-0 flex items-center justify-center rounded-2xl bg-white/[0.04] border border-white/[0.06] px-1 hover:bg-white/[0.09] hover:border-white/[0.12] transition-colors ${
                compact ? 'flex-row gap-1.5 py-1' : 'flex-col gap-1.5 py-2'
              }`}
            >
              <span
                className={`flex items-center justify-center bg-indigo-500 text-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] ring-1 ring-black/20 shrink-0 ${
                  compact ? 'w-7 h-7 rounded-lg' : 'w-10 h-10 rounded-xl'
                }`}
              >
                <Icon size={compact ? 14 : 19} />
              </span>
              <span className={`leading-tight text-white/75 whitespace-nowrap ${compact ? 'text-[11px]' : 'text-center text-xs'}`}>
                {toolLabel(t.id, t.label)}
              </span>
            </button>
          );
        })}
      </div>

      {/* 工作区面：首次打开后常驻挂载（收起只隐藏，保住已选文件与处理结果） */}
      {everOpened && (
        <div data-tools-workspace data-active-tool={ws.tool} className={`flex-1 min-h-0 flex-col ${ws.open ? 'flex' : 'hidden'}`}>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-tools-back
              onClick={() => closeToolsWorkspace()}
              className="flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-xs text-white/60 transition-colors hover:bg-white/10 hover:text-white shrink-0"
            >
              <ChevronLeft size={14} />
              {t('home.toolsAll')}
            </button>
            <span className="text-sm font-medium text-white/90 truncate">{toolLabel(activeDef.id, activeDef.label)}</span>
            <span className="ml-auto hidden sm:flex items-center gap-1 text-[11px] text-white/40 shrink-0">
              <ShieldCheck size={12} className="text-emerald-300/80 shrink-0" />
              {t('home.toolsLocal')}
            </span>
          </div>

          {/* 工具切换条：不回瓷砖面也能换工具（切换即重挂载，与原工具页切 tab 一致）。
              可换行（第一百零四轮）：窄屏放不下就排两行，6 个标签全可见——不横滚、不裁切；
              桌面宽卡一行放得下时自然保持单行 */}
          <div className="mt-2 flex flex-wrap gap-1.5 pb-1 shrink-0" role="tablist" aria-label={t('home.toolsList')}>
            {TOOL_DEFS.map((t) => {
              const Icon = t.icon;
              const active = t.id === ws.tool;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-tool-tab={t.id}
                  onClick={() => setToolsWorkspaceTool(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-indigo-500/25 text-white border border-indigo-400/40'
                      : 'bg-white/[0.04] text-white/60 border border-white/10 hover:bg-white/[0.08] hover:text-white'
                  }`}
                >
                  <Icon size={13} />
                  {toolLabel(t.id, t.label)}
                </button>
              );
            })}
          </div>

          {/* 工具本体：内部滚动承接超高内容（结果图列/长列表），data-nodrag 防卡片拖拽抢手势 */}
          <div data-nodrag className="mt-2 flex-1 min-h-0 overflow-y-auto pr-1">
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-12">
                  <div className="h-6 w-6 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                </div>
              }
            >
              <ActiveTool key={ws.tool} compact />
            </Suspense>
          </div>
        </div>
      )}
    </Card>
  );
}
