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

/** 站点 logo 图片（带加载失败兜底），与 NavPage 保持一致的白底圆角样式 */
export function SiteLogo({
  logo,
  name,
  url,
  size = 36,
  imgSize = 26,
  className = '',
  grayscale = false,
}: {
  logo: string;
  name: string;
  /** 站点地址（可选）：图标加载失败时先试该站自己的 /favicon.ico，再回落字母 */
  url?: string;
  size?: number;
  imgSize?: number;
  className?: string;
  grayscale?: boolean;
}) {
  return (
    <div
      className={`site-icon-frame rounded-xl bg-white flex items-center justify-center overflow-hidden shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={logo}
        alt={name}
        draggable={false}
        loading="lazy"
        className={`object-contain ${grayscale ? 'grayscale opacity-60' : ''}`}
        style={{ width: imgSize, height: imgSize }}
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          // 二段回落（2026-10-28 晚）：本地图标 404 → 该站自己的 /favicon.ico → 字母；
          // 解决已应用预设的旧数据（存的是 /icon_APP/ 路径）不随预设定义更新的问题
          if (target.src.startsWith('data:')) return;
          if (target.src.includes('/favicon.ico')) {
            target.src = siteLogoFallback(name);
            return;
          }
          if (url) {
            try {
              target.src = `${new URL(url).origin}/favicon.ico`;
              return;
            } catch {
              // URL 不合法时直接回落字母
            }
          }
          target.src = siteLogoFallback(name);
        }}
      />
    </div>
  );
}
