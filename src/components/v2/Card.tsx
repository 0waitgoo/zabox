import React from 'react';
import { motion } from 'motion/react';
import { siteLogoFallback } from '../../data/groups';
import type { WidgetTint } from '../../store/localStore';
import WidgetTintLayer from './WidgetTint';

/** A 型小组件卡的统一卡壳：标题行（图标 + 标题 + 右侧操作） + 内容区；
 *  传入 tint 时在内容之下叠一层专属底色（渐变 + 居中 Emoji 水印，第二十三轮/第三十六轮） */
export function Card({
  title,
  icon,
  right,
  children,
  className = '',
  onClick,
  delay = 0,
  tint,
  watermark,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  delay?: number;
  /** 专属底色（第二十三轮）：与 watermark 同时传入才渲染底色层 */
  tint?: WidgetTint;
  /** 水印字符（按卡片语义传入的 Emoji，居中渲染，第三十六轮） */
  watermark?: string;
}) {
  // 第七十八轮：基底改与编组卡同款的面（.widget-panel，跟随整体外观两档）；
  // 根挂 .group-card-scope 让白天翻字规则表命中（C 卡同款接法）
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      onClick={onClick}
      className={`group-card-scope widget-panel widget-panel-hover relative rounded-[28px] h-full p-4 sm:p-5 flex flex-col overflow-hidden transition-colors ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {tint && watermark && <WidgetTintLayer tint={tint} emoji={watermark} />}
      <div className="relative flex flex-col flex-1 min-h-0">
        {title !== undefined && (
          <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              {icon}
              <h3 className="font-semibold text-base sm:text-lg tracking-tight truncate">{title}</h3>
            </div>
            {right}
          </div>
        )}
        {children}
      </div>
    </motion.div>
  );
}

/** 卡片标题左侧的圆形图标徽（第八十二轮：改实底——各组件专属色满底 + 白 glyph +
 * 深色细环与浅投影定轮廓；改前为 /20 半透明底 + -300 粉彩字，压在壁纸/渐变上几乎看不见） */
export function CardIconBadge({ children, className = 'bg-indigo-500 text-white' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-[0_1px_4px_rgba(0,0,0,0.3)] ring-1 ring-black/20 ${className}`}>
      {children}
    </div>
  );
}

/**
 * 站点图标解析缓存（模块级，页面会话内有效）：
 * 展开/收起会卸载一套 <img>、挂载另一套，没有缓存时每次挂载都要重跑
 * 本地图标 404 → 第三方 /favicon.ico → 字母 的回落链，第三方 favicon 慢就整体慢。
 * 键为站点 URL；值记首次解析的初始 src 与站名——初始 src 或站名变了（用户换图标/改名）
 * 缓存自动失效，重新跑链并刷新，避免换图标后仍显示旧图、改名后仍显示旧字标。
 */
type ResolvedIconSrc = { initial: string; name: string; src: string };
const iconSrcCache = new Map<string, ResolvedIconSrc>();

/** 取缓存的解析结果（初始 src 与站名都未变时才命中；无 url 时不缓存） */
export function cachedIconSrc(url: string | undefined, initial: string, name: string): string | undefined {
  if (!url) return undefined;
  const hit = iconSrcCache.get(url);
  return hit && hit.initial === initial && hit.name === name ? hit.src : undefined;
}

/** 记一笔解析结果：最终可用地址（第三方 favicon 或字母兜底） */
export function storeIconSrc(url: string | undefined, initial: string, name: string, src: string): void {
  if (!url) return;
  iconSrcCache.set(url, { initial, name, src });
}

/**
 * 回落链单步：当前 src 失败后下一步应试的地址；返回 undefined 表示链已走完
 * （已是字母图 data:，调用方按原行为处理：SiteLogo/SiteTile 停住、组头图标隐藏）。
 * 链：本地图标 404 → 该站自己的 /favicon.ico → 字母。
 */
export function nextFallbackIconSrc(currentSrc: string, url: string | undefined, name: string): string | undefined {
  if (currentSrc.startsWith('data:')) return undefined;
  if (currentSrc.includes('/favicon.ico')) return siteLogoFallback(name);
  if (url) {
    try {
      return `${new URL(url).origin}/favicon.ico`;
    } catch {
      // URL 不合法时直接回落字母
    }
  }
  return siteLogoFallback(name);
}

/** 站点 logo 图片（带加载失败兜底）：图标直接铺满圆角框，无白底（2026-10-30 用户定） */
export function SiteLogo({
  logo,
  name,
  url,
  size = 36,
  className = '',
  grayscale = false,
}: {
  logo: string;
  name: string;
  /** 站点地址（可选）：图标加载失败时先试该站自己的 /favicon.ico，再回落字母 */
  url?: string;
  size?: number;
  /** 旧参数：保留签名兼容（调用方仍传），图标现一律铺满 size 框，不再缩小 */
  imgSize?: number;
  className?: string;
  grayscale?: boolean;
}) {
  return (
    <div
      className={`site-icon-frame rounded-xl flex items-center justify-center overflow-hidden shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={cachedIconSrc(url, logo, name) ?? logo}
        alt={name}
        draggable={false}
        loading="lazy"
        className={`w-full h-full object-contain ${grayscale ? 'grayscale opacity-60' : ''}`}
        onLoad={(e) => {
          // 回落链走出的地址一旦加载成功即记缓存（第三方 favicon 或字母图）；
          // 本地初始图标本身不记，下次挂载仍走初始地址
          const target = e.target as HTMLImageElement;
          if (target.src.includes('/favicon.ico') || target.src.startsWith('data:')) {
            storeIconSrc(url, logo, name, target.src);
          }
        }}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          // 二段回落（2026-10-28 晚）：本地图标 404 → 该站自己的 /favicon.ico → 字母；
          // 解决已应用预设的旧数据（存的是 /icon_APP/ 路径）不随预设定义更新的问题
          const next = nextFallbackIconSrc(target.src, url, name);
          if (next !== undefined) target.src = next;
        }}
      />
    </div>
  );
}
