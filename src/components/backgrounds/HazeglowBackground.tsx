import React, { useState } from 'react';
import { Hazeglow, type GradientConfig } from 'hazeglow';

/**
 * HazeglowBackground —— 背景预设「雾光」（2026-11-22 用户在 hazeglow.dev/generator 挑好的参数；
 * 02:28 修过一次：2 个网格点改色移位——[0.857, 0.244, '#65989f']、[0.602, 0.472, '#63a15e']，其余不变）。
 *
 * 开源库 hazeglow（MIT，WebGL2、零依赖、约 13kb）：一个 JSON config 进去，一个 Canvas
 * 出来——网格渐变＋颗粒＋缓慢流动＋悬停拉扯＋玻璃质感。用户挑的这套是 mesh 形状、
 * 深绿/青蓝调色板、黑底、grain 0.3、flow、speed 1.65、hover pull 0.11、glass 56/0.5。
 *
 * 兜底：无 WebGL2 GPU 时 onUnsupported 触发，不挂 Canvas，透出父层 preset.css 的
 * 深绿黑渐变（面板缩略与挂载前同款），不白屏。诊断标记 data-hazeglow-unsupported 供自测。
 * 性能：Hazeglow 自带离屏暂停、减弱动效只画一帧、DPR 封顶 2；全站只挂一个实例。
 * （本组件不参与主题三档：背景层不随主题变，暗夜/白天/液态玻璃下同一款。）
 */

export const HAZEGLOW_CONFIG: GradientConfig = {
  version: 1,
  seed: 1,
  shape: 'mesh',
  center: [0.5, 0.42],
  size: [0.86, 0.6],
  roundness: 0.7,
  softness: 1,
  rotation: 0,
  rampDirection: 0.9,
  angle: 90,
  warp: 0.75,
  warpScale: 1.55,
  palette: ['#16232f', '#6c8796', '#112529', '#b0d6b5', '#264844', '#abb7d5', '#377377', '#57c66a', '#d9ecef', '#06260d'],
  background: '#000000',
  mesh: [
    [0.964, 0.029, '#16232f'],
    [0.469, 0.075, '#6c8796'],
    [0.031, 0.125, '#112529'],
    [0.857, 0.244, '#65989f'],
    [0.031, 0.275, '#b0d6b5'],
    [0.469, 0.425, '#264844'],
    [0.602, 0.472, '#63a15e'],
    [0.969, 0.725, '#377377'],
    [0.031, 0.825, '#43686d'],
    [0.406, 0.875, '#57c66a'],
    [0.719, 0.925, '#d9ecef'],
    [0.469, 0.975, '#06260d'],
  ],
  grain: 0.3,
  motion: 'flow',
  speed: 1.65,
  loop: 0,
  hover: 0.11,
  hoverMode: 'pull',
  effect: 'glass',
  effectSize: 56,
  effectAmount: 0.5,
};

interface HazeglowBackgroundProps {
  className?: string;
  style?: React.CSSProperties;
}

export default function HazeglowBackground({ className, style }: HazeglowBackgroundProps) {
  const [unsupported, setUnsupported] = useState(false);
  return (
    <div
      className={className}
      style={style}
      aria-hidden
      data-hazeglow-background
      data-hazeglow-unsupported={unsupported || undefined}
    >
      {!unsupported && <Hazeglow config={HAZEGLOW_CONFIG} onUnsupported={() => setUnsupported(true)} />}
    </div>
  );
}
