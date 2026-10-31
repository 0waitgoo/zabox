import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, RefreshCw } from 'lucide-react';
import { useLang } from '../../i18n/useLang';
import { fetchTrends, type TrendItem } from '../../services/api';
import type { WidgetTint } from '../../store/localStore';
import WidgetTintLayer from '../v2/WidgetTint';

/** 热门话题（第九十五轮重做）：数据经本站 /api 聚合微博热搜 + 百度热搜的公开热榜，
 *  heatText 为源站真实热度的格式化展示；拉不到时显示空态，绝不编造话题与热度。
 *  版式照参照图：卡头「实时 + 更新时间」，话题为单列软底圆角行（# 话题 …… 热度）。 */
export default function TrendingWidget({
  tint,
  heightUnits = 1,
}: {
  /** 专属底色（第二十三轮，由 HomePage 按 widgetTints 分配传入；旧 BentoGrid 用法不传则无底色） */
  tint?: WidgetTint;
  /** 生效高度档（1x 显示 4 行、2x 显示 8 行），由注册表适配层按布局传入 */
  heightUnits?: number;
} = {}) {
  const [items, setItems] = useState<TrendItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const { t, lang } = useLang();

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    const result = await fetchTrends();
    setItems(result.items);
    setUpdatedAt(result.updatedAt);
    setStale(result.stale);
    setFailed(result.items.length === 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  /** 卡内拖拽滚动（第一百一十轮，照计划卡 useCardDragScroll 的模式）：
   *  5px 阈值区分点击与拖动；超过阈值松手后 400ms 内吞掉 click，避免拖完误打开话题；
   *  触摸端不动（原生滚动已有）。列表容器另挂 data-nodrag，卡内拖动不触发整卡拖拽排序；
   *  滚轮走原生 overflow-y-auto（全站滚动条全局隐藏，只隐条不禁滚）。 */
  const SCROLL_DRAG_THRESHOLD = 5;
  const listRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startY: number; startTop: number; dragging: boolean } | null>(null);
  const suppressAtRef = useRef(0);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const d = dragRef.current;
      const el = listRef.current;
      if (!d || !el || e.pointerId !== d.pointerId) return;
      const dy = e.clientY - d.startY;
      if (!d.dragging) {
        if (Math.abs(dy) <= SCROLL_DRAG_THRESHOLD) return;
        d.dragging = true;
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
      }
      el.scrollTop = d.startTop - dy;
    };
    const onPointerEnd = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d || e.pointerId !== d.pointerId) return;
      dragRef.current = null;
      if (d.dragging) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        suppressAtRef.current = Date.now();
      }
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerEnd);
    window.addEventListener('pointercancel', onPointerEnd);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerEnd);
      window.removeEventListener('pointercancel', onPointerEnd);
      if (dragRef.current?.dragging) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      dragRef.current = null;
    };
  }, []);

  const onListPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || dragRef.current) return;
    if (!listRef.current) return;
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY, startTop: listRef.current.scrollTop, dragging: false };
  };

  const onListClickCapture = (e: React.MouseEvent) => {
    if (suppressAtRef.current && Date.now() - suppressAtRef.current < 400) {
      suppressAtRef.current = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  };

  /* 第一百一十轮：列表不再按高度档截断行数——卡高决定可视窗口，其余行全部滚动可见；
   * heightUnits 入参保留（注册表传入），不再用于截断。 */
  void heightUnits;
  const rows = items;
  const timeText = updatedAt
    ? new Date(updatedAt).toLocaleTimeString(lang === 'en' ? 'en-US' : 'zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '';

  const tintLayer = tint ? <WidgetTintLayer tint={tint} emoji="🔥" /> : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="group-card-scope widget-panel relative rounded-[32px] h-full p-4 sm:p-5 flex flex-col overflow-hidden"
      onClick={(e) => e.stopPropagation()}
    >
      {tintLayer}
      <div className="relative flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-indigo-500 text-white shadow-[0_1px_4px_rgba(0,0,0,0.3)] ring-1 ring-black/20 flex items-center justify-center shrink-0">
              <TrendingUp size={14} />
            </div>
            <h3 className="font-semibold text-base sm:text-lg tracking-tight truncate">{t('widget.trendingTitle')}</h3>
          </div>
          <span className={`text-[11px] shrink-0 ${stale ? 'text-amber-300/80' : 'text-white/40'}`}>
            {loading || failed ? t('widget.live') : stale ? t('widget.liveStale', { time: timeText }) : t('widget.liveUpdated', { time: timeText })}
          </span>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <RefreshCw size={20} className="text-white/30 animate-spin" />
          </div>
        ) : failed ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
            <span className="text-sm text-white/60">{t('widget.trendsEmpty')}</span>
            <span className="text-[11px] text-white/35">{t('widget.trendsUnreachable')}</span>
            <button
              onClick={load}
              className="mt-1 flex items-center gap-1.5 text-xs text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full px-3 py-1.5 transition-colors"
            >
              <RefreshCw size={12} /> {t('widget.retry')}
            </button>
          </div>
        ) : (
          <div
            ref={listRef}
            data-nodrag
            onPointerDown={onListPointerDown}
            onClickCapture={onListClickCapture}
            className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5"
          >
            {rows.map((trend) => (
              <button
                key={trend.id}
                onClick={() => trend.url && window.open(trend.url, '_blank')}
                className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl px-3 py-2 text-left transition-colors"
                title={`${trend.topic}（${trend.source}）`}
              >
                <span className="flex-1 min-w-0 text-[13px] font-semibold truncate"># {trend.topic}</span>
                <span className="shrink-0 text-[10px] text-white/35">{trend.source.replace('热搜', '')}</span>
                <span className="shrink-0 text-xs text-white/60 tabular-nums">
                  {t('widget.heat')} <span className="text-white/85 font-medium">{trend.heatText}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
