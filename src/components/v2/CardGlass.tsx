import React from 'react';
import { LiquidGlass } from 'quick-liquid/react';

/** 卡片玻璃（2026-11-21 用户令：把 Dock 的 quickLiquid 效果推广到 B 卡与组合卡）。
 * 数值与 Dock 一致（用户 2026-11-21 00:16 给的）：thin、blur 5.5、折射 50、边框 27、
 * 色差 0、光角 -156、高光 0.35、色散 auto、深色外观；圆角按卡型给（B 卡 28、组合卡身 22），
 * 不沿用 Dock 的 44。 */
const CARD_GLASS_BASE = {
  material: 'thin' as const,
  blur: 5.5,
  refractionStrength: 50,
  bezelWidth: 27,
  chromaticAberration: 0,
  lightAngle: -156,
  specularStrength: 0.35,
  dispersionMode: 'auto' as const,
  appearance: 'dark' as const,
  /* 性能档（2026-11-21 用户令优化速度、效果不变）：medium 把位移图分辨率上限从
     1024 降到 384（库文档原话：dense lists or background UI 用 medium/low）。
     位移图是平滑渐变，384 仍够平滑，折射形状不变；同尺寸卡共用一张图，像素量
     降约 7 倍，生成与采样都更便宜。 */
  quality: 'medium' as const,
};

export default function CardGlass({
  radius,
  className,
  enabled = true,
  children,
}: {
  /** 玻璃圆角（px），与卡身圆角一致 */
  radius: number;
  className?: string;
  /** 关时不挂玻璃、原样透传 children（供暗夜/白天主题回落磨砂卡面） */
  enabled?: boolean;
  children: React.ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <LiquidGlass config={{ ...CARD_GLASS_BASE, borderRadius: radius }} className={className}>
      {children}
    </LiquidGlass>
  );
}
