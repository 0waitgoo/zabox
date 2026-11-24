import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MapPin } from 'lucide-react';
import { useLang } from '../../i18n/useLang';
import { fetchIp } from '../../services/api';
import type { IpGeo } from '../../services/api';
import type { WidgetLayout } from '../../store/localStore';

/**
 * 时间小组件（2026-11-22 位置行：IP 归属地＋经纬度＋城市名）：
 * 两种风格（右上角按钮切换，存独立 key，随提醒句一起持久化；日程/线框已按用户令删除）：
 * - 海报：分享版同款纯黑海报，系统无衬线粗体大字，无网络字体；日期 900 号字再加 3px 白描边（描边在外，不吃字腔），是全卡最粗的字；日期字距放宽到 0.04em，不再黏在一起；2x2 左今日日期、右具体时间（冒号分隔），明日只留左栏小字一行；时间全站改冒号（22:44:24，海报＋气泡同路）；2x2 右栏：居中对齐、时间 64px 整行（秒与时分同大，不再小字右上角）、左右顶对齐（两栏包在居中块里、内容从同顶开始）。
 * - 气泡：白气泡（日期）＋蓝气泡（时间），参考用户发的气泡海报（白底黑字「日期」＋蓝底白字「时间」），蓝白配色用户喜欢故保留；灵动版：气泡只贴内容宽、白左蓝右错开、微倾斜，右上角不再被挡；2 栏加满：2x2 日期 64/时间 52 大字＋第三只白气泡装明日（18px），2x1 日期 44/时间 36、蓝气泡内收 40px 不挡右上角、IP＋农历同一行、气泡行上垫 16px 避开开关；浮动循环动画：白蓝气泡轻微上下浮动 4px、3 秒一圈无限循环，白蓝错半拍、明日错 1/4 拍（index.css 的 time-bubble-float，减弱动效偏好下停掉）。
 * 四种版式（1x1 紧凑 / 2x1 横排 / 1x2 大字 / 2x2 双栏）× 两种风格共 8 种组合。
 * 无标题栏（纯海报）；提醒输入无下划线。
 * 字阶（平面设计口径）：眉标 10px/宽距/中粗 → 主数字 900 → 时间 800 → 次级 700 → 正文 400，黑白灰三档。
 * 位置行（2026-11-22 用户令）：IP 归属地（服务端 /api?type=ip 调 ip-api.com 查，失败回落只显示 IP），
 * 显示为图钉 ICON＋英文缩写经纬度（1 位小数＋°，如 N 1.3° E 103.9°）＋城市名；点按复制时间＋位置。每次打开现取，不存。
 * 提醒句与风格是组件自有数据，存独立 key（ainav-widget-time-data），不进主仓、不参与同步。
 * 海报就是纯黑，不挂底色层（故不接 tint）。
 */

/** 海报字体：与分享版一致——系统无衬线（Arial/Helvetica 风格），无网络字体 */
/** 海报字体（与时间组件同款，供其余小组件共用，勿各处复制） */
export const POSTER_FONT = '"Arial", "Helvetica Neue", Helvetica, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 组件自有数据 key（注册表 storage 声明登记） */
const DATA_KEY = 'ainav-widget-time-data';

type TimeStyle = 'poster' | 'bubble';
const STYLE_IDS: TimeStyle[] = ['poster', 'bubble'];
const STYLE_LABEL_KEYS: Record<TimeStyle, string> = {
  poster: 'widget.stylePoster',
  bubble: 'widget.styleBubble',
};

interface TimeWidgetData {
  note?: string;
  style?: TimeStyle;
}

const DAY_NAMES = [
  '初一', '初二', '初三', '初四', '初五', '初六', '初七', '初八', '初九', '初十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '廿一', '廿二', '廿三', '廿四', '廿五', '廿六', '廿七', '廿八', '廿九', '三十',
];
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 农历（如「丙午年十月十三」）：浏览器内置 Intl 中国农历历法分段取值，
 *  yearName 直接给干支年名（跨年边界由 ICU 处理）；取不到时回落空串，绝不编造。 */
function lunarText(d: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const yearName = get('yearName');
    const month = get('month');
    const day = Number(get('day'));
    if (!yearName || !month || !day || !DAY_NAMES[day - 1]) return '';
    return `${yearName}年${month}${DAY_NAMES[day - 1]}`;
  } catch {
    return '';
  }
}

/** 带圈星期字（海报设计元素：六套在圆圈里） */
function CircledWeekday({ ch, className = '' }: { ch: string; className?: string }) {
  return (
    <span className={`inline-flex items-center justify-center rounded-full border border-white/80 font-bold shrink-0 ${className}`}>
      {ch}
    </span>
  );
}

function loadData(): TimeWidgetData {
  try {
    const d = JSON.parse(localStorage.getItem(DATA_KEY) ?? '{}') as TimeWidgetData;
    if (d.style && !STYLE_IDS.includes(d.style)) delete d.style;
    return d;
  } catch {
    return {};
  }
}

/** 日期最粗：900 号字再加 3px 白描边（描边在外，不吃字腔） */
const DATE_BLACK: React.CSSProperties = { WebkitTextStroke: '3px #ffffff', paintOrder: 'stroke fill' };

/** 各风格渲染共用的数据与行 */
interface StyleShared {
  now: Date;
  lunar: string;
  dateNum: string;
  monthNum: string;
  dayNum: string;
  timeText: string;
  secondsText: string;
  fullTime: string;
  weekdayText: string;
  tomorrowDateNum: string;
  tomorrowWeekdayText: string;
  ampm: string;
  todayLabel: string;
  tomorrowLabel: string;
  wide: boolean;
  tall: boolean;
  /** 手机单列：1x2 日期行给右上角风格按钮让位（pr-20），桌面 1x2 栏窄放不下不让 */
  phone: boolean;
  ipRow: React.ReactNode;
  noteRow: React.ReactNode;
}

/* ---------------- 风格一：海报（分享版同款） ---------------- */
function PosterStyle(p: StyleShared) {
  const { wide, tall, lunar, dateNum, monthNum, dayNum, timeText, secondsText, fullTime, weekdayText, tomorrowDateNum, tomorrowWeekdayText, ampm, todayLabel, tomorrowLabel, ipRow, noteRow, phone } = p;
  return (
    <>
      {/* 1x1 紧凑：TIME 年份 + 大日期 + 时间 PM 星期 + IP + 农历 */}
      {!wide && !tall && (
        <div className="flex-1 min-h-0 flex flex-col justify-center">
          <div className="text-[10px] tracking-[0.35em] font-medium text-[#A3A3A3]">TIME {p.now.getFullYear()}</div>
          <div className="mt-1 font-black tabular-nums leading-none tracking-[0.04em] text-[46px]" style={DATE_BLACK}><span className="opacity-60">{monthNum}</span>/{dayNum}</div>
          <div className="mt-1.5 text-[14px] font-bold tabular-nums">
            {timeText}<span className="opacity-60">{secondsText}</span> <span className="text-[#A3A3A3] font-medium text-[13px]">{ampm} {weekdayText}</span>
          </div>
          <div className="mt-1.5">{ipRow}</div>
          {lunar ? <div className="mt-1 text-[12px] text-white">农历 {lunar}</div> : null}
        </div>
      )}

      {/* 2x1 横排：左 TIME/年份｜中大日期｜右 PM+带圈星期/全时间；下方 IP + 农历 */}
      {wide && !tall && (
        <>
          <div className="flex-1 min-h-0 flex items-center gap-4">
            <div className="shrink-0">
              <div className="text-[10px] tracking-[0.3em] font-medium text-[#A3A3A3]">TIME</div>
              <div className="font-bold tabular-nums leading-none text-[20px]">{p.now.getFullYear()}</div>
            </div>
            <div className="flex-1 min-w-0 text-center font-black tabular-nums leading-none tracking-[0.04em] text-[56px]" style={DATE_BLACK}><span className="opacity-60">{monthNum}</span>/{dayNum}</div>
            <div className="shrink-0 flex flex-col items-end">
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-[#A3A3A3]">{ampm}</span>
                <CircledWeekday ch={WEEKDAYS[p.now.getDay()]} className="w-5 h-5 text-[12px]" />
              </div>
              <div className="mt-1 font-extrabold tabular-nums leading-none text-[22px]">{timeText}<span className="opacity-60">{secondsText}</span></div>
            </div>
          </div>
          <div className="shrink-0 mt-2 flex flex-col gap-1">
            {ipRow}
            {lunar ? <div className="text-[12px] text-white">农历 {lunar}</div> : null}
          </div>
        </>
      )}

      {/* 1x2 大字：竖排年份 + 超大日期 + 带圈星期；大时间 + 灰秒；农历；IP + 提醒 */}
      {!wide && tall && (
        <>
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            <div className={`flex items-center gap-3${phone ? ' pr-20' : ''}`}>
              <div className="flex flex-col font-bold tabular-nums leading-[0.95] text-[24px] shrink-0">
                <span>{String(p.now.getFullYear()).slice(0, 2)}</span>
                <span>{String(p.now.getFullYear()).slice(2)}</span>
              </div>
              <div className="flex-1 min-w-0 font-black tabular-nums leading-none tracking-[0.04em] text-[62px]" style={DATE_BLACK}><span className="opacity-60">{monthNum}</span>/{dayNum}</div>
              <CircledWeekday ch={WEEKDAYS[p.now.getDay()]} className="w-7 h-7 text-[15px]" />
            </div>
            <div className="mt-2.5 font-extrabold tabular-nums leading-none tracking-tight text-[40px]">
              {timeText}
              <span className="text-[#A3A3A3] font-medium text-[0.45em] align-top opacity-60">{secondsText}</span>
            </div>
            {lunar ? <div className="mt-3 text-[14px] text-white">农历 {lunar}</div> : null}
          </div>
          <div className="shrink-0 flex flex-col gap-2.5 mt-1" data-nodrag>
            {ipRow}
            {noteRow}
          </div>
        </>
      )}

      {/* 2x2 双栏：左=今日日期＋IP/农历/明日小字，右=具体时间（冒号分隔、居中、64px 整行、左右顶对齐） */}
      {wide && tall && (
        <>
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            <div className="flex gap-4">
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="text-[10px] tracking-[0.35em] font-medium text-[#A3A3A3]">{todayLabel}</div>
                <div className="mt-1 font-black tabular-nums leading-none tracking-[0.04em] text-[52px]" style={DATE_BLACK}><span className="opacity-60">{monthNum}</span>/{dayNum}</div>
                <div className="mt-2.5 min-w-0">{ipRow}</div>
                {lunar ? <div className="mt-1.5 text-[13px] text-white truncate">农历 {lunar}</div> : null}
                <div className="mt-1.5 text-[13px] text-[#A3A3A3] truncate">{tomorrowLabel} {tomorrowDateNum} {tomorrowWeekdayText}</div>
              </div>
              <div className="w-px self-stretch my-2 bg-white/15 shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col items-center text-center">
                <div className="text-[10px] tracking-[0.35em] font-medium text-[#A3A3A3]">时间</div>
                <div className="mt-1 font-extrabold tabular-nums leading-none tracking-tight text-[64px] whitespace-nowrap">{timeText}<span className="opacity-60">{secondsText}</span></div>
                <div className="mt-2 text-[24px] font-bold">
                  <span className="text-[#A3A3A3] font-medium">{ampm} </span>
                  {weekdayText}
                </div>
              </div>
            </div>
          </div>
          <div className="shrink-0 mt-1" data-nodrag>
            {noteRow}
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- 风格二：气泡（白气泡日期＋蓝气泡时间，灵动版：气泡只贴内容宽、白左蓝右错开、微倾斜，右上角不再被挡） ---------------- */
function WhiteBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-[22px] bg-white text-black px-4 py-2.5">
      {children}
      <div className="absolute -bottom-[5px] left-6 w-3 h-3 bg-white rotate-45" />
    </div>
  );
}
function BlueBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative rounded-[22px] bg-[#2563EB] text-white px-4 py-2.5">
      {children}
      <div className="absolute -bottom-[5px] right-6 w-3 h-3 bg-[#2563EB] rotate-45" />
    </div>
  );
}
function BubbleStyle(p: StyleShared) {
  const { wide, tall, lunar, dateNum, monthNum, dayNum, timeText, secondsText, fullTime, weekdayText, tomorrowDateNum, tomorrowWeekdayText, ampm, tomorrowLabel, ipRow, noteRow } = p;
  return (
    <>
      {/* 1x1：白气泡日期（左，微倾）＋蓝气泡时间（右，微倾）＋IP＋农历 */}
      {!wide && !tall && (
        <div className="flex-1 min-h-0 flex flex-col justify-center gap-2">
          <div className="w-fit max-w-full -rotate-2 time-bubble-float">
            <WhiteBubble>
              <div className="flex items-end justify-between gap-3">
                <div className="font-black tabular-nums leading-none tracking-[0.04em] text-[32px]"><span className="opacity-60">{monthNum}</span>/{dayNum}</div>
                <div className="text-right shrink-0 pb-0.5">
                  <div className="text-[9px] tracking-[0.25em] font-medium text-black/50">TIME</div>
                  <div className="text-[13px] font-bold text-[#2563EB]">日期</div>
                </div>
              </div>
            </WhiteBubble>
          </div>
          <div className="w-fit max-w-full ml-auto rotate-[1.5deg] time-bubble-float-delay">
            <BlueBubble>
              <div className="flex items-center gap-2">
                <div className="font-black tabular-nums leading-none text-[14px]">{timeText}<span className="opacity-60">{secondsText}</span></div>
                <div className="text-[12px] font-bold">时间</div>
              </div>
            </BlueBubble>
          </div>
          {ipRow}
          {lunar ? <div className="text-[12px] text-white">农历 {lunar}</div> : null}
        </div>
      )}

      {/* 2x1：白气泡日期（左）｜蓝气泡时间（右，内收不挡右上角）；IP＋农历同一行 */}
      {wide && !tall && (
        <>
          <div className="flex-1 min-h-0 flex items-center justify-between gap-3 pt-4">
            <div className="w-fit max-w-[55%] -rotate-2 time-bubble-float">
              <WhiteBubble>
                <div className="flex items-end justify-between gap-2">
                  <div className="font-black tabular-nums leading-none tracking-[0.04em] text-[44px]"><span className="opacity-60">{monthNum}</span>/{dayNum}</div>
                  <div className="text-right shrink-0 pb-0.5">
                    <div className="text-[9px] tracking-[0.25em] font-medium text-black/50">TIME</div>
                    <div className="text-[13px] font-bold text-[#2563EB]">日期</div>
                  </div>
                </div>
              </WhiteBubble>
            </div>
            <div className="w-fit max-w-[55%] mr-10 rotate-[1.5deg] time-bubble-float-delay">
              <BlueBubble>
                <div className="flex items-end justify-between gap-2">
                  <div className="font-black tabular-nums leading-none text-[36px]">{timeText}<span className="opacity-60">{secondsText}</span></div>
                  <div className="text-right shrink-0 pb-0.5">
                    <div className="text-[9px] tracking-[0.25em] font-medium text-white/70">{ampm}</div>
                    <div className="text-[13px] font-bold">时间</div>
                  </div>
                </div>
              </BlueBubble>
            </div>
          </div>
          <div className="shrink-0 mt-2 flex items-center gap-4">
            {ipRow}
            {lunar ? <div className="text-[12px] text-white">农历 {lunar}</div> : null}
          </div>
        </>
      )}

      {/* 1x2：白气泡日期（左，微倾）＋蓝气泡时间（右，微倾）＋明日/IP/农历/提醒 */}
      {!wide && tall && (
        <>
          <div className="flex-1 min-h-0 flex flex-col justify-center gap-3">
            <div className="w-fit max-w-full -rotate-2 time-bubble-float">
              <WhiteBubble>
                <div className="flex items-end justify-between gap-3">
                  <div className="font-black tabular-nums leading-none tracking-[0.04em] text-[36px]"><span className="opacity-60">{monthNum}</span>/{dayNum}</div>
                  <div className="text-right shrink-0 pb-0.5">
                    <div className="text-[10px] tracking-[0.25em] font-medium text-black/50">TIME</div>
                    <div className="text-[14px] font-bold text-[#2563EB]">日期</div>
                  </div>
                </div>
              </WhiteBubble>
            </div>
            <div className="w-fit max-w-full ml-auto rotate-[1.5deg] time-bubble-float-delay">
              <BlueBubble>
                <div className="flex items-end justify-between gap-3">
                  <div className="font-black tabular-nums leading-none text-[30px]">{timeText}<span className="opacity-60">{secondsText}</span></div>
                  <div className="text-right shrink-0 pb-0.5">
                    <div className="text-[10px] tracking-[0.25em] font-medium text-white/70">{ampm}</div>
                    <div className="text-[14px] font-bold">时间</div>
                  </div>
                </div>
              </BlueBubble>
            </div>
          </div>
          <div className="shrink-0 mt-2 flex flex-col gap-1">
            <div className="text-[13px] text-[#A3A3A3]">{tomorrowLabel} {tomorrowDateNum} {tomorrowWeekdayText}</div>
            {ipRow}
            {lunar ? <div className="text-[13px] text-white">农历 {lunar}</div> : null}
          </div>
          <div className="shrink-0 mt-1" data-nodrag>{noteRow}</div>
        </>
      )}

      {/* 2x2：白气泡日期（左，微倾）＋蓝气泡时间（右，微倾）＋白气泡明日（左）＋IP/农历/提醒——2 栏加满 */}
      {wide && tall && (
        <>
          <div className="flex-1 min-h-0 flex flex-col justify-center gap-4">
            <div className="w-fit max-w-full -rotate-2 time-bubble-float">
              <WhiteBubble>
                <div className="flex items-end justify-between gap-3">
                  <div className="font-black tabular-nums leading-none tracking-[0.04em] text-[64px]"><span className="opacity-60">{monthNum}</span>/{dayNum}</div>
                  <div className="text-right shrink-0 pb-0.5">
                    <div className="text-[10px] tracking-[0.25em] font-medium text-black/50">TIME</div>
                    <div className="text-[15px] font-bold text-[#2563EB]">日期</div>
                  </div>
                </div>
              </WhiteBubble>
            </div>
            <div className="w-fit max-w-full ml-auto rotate-[1.5deg] time-bubble-float-delay">
              <BlueBubble>
                <div className="flex items-end justify-between gap-3">
                  <div className="font-black tabular-nums leading-none text-[52px]">{timeText}<span className="opacity-60">{secondsText}</span></div>
                  <div className="text-right shrink-0 pb-0.5">
                    <div className="text-[10px] tracking-[0.25em] font-medium text-white/70">{ampm}</div>
                    <div className="text-[15px] font-bold">时间</div>
                  </div>
                </div>
              </BlueBubble>
            </div>
            <div className="w-fit max-w-full -rotate-1 time-bubble-float-delay-2">
              <WhiteBubble>
                <div className="flex items-center gap-2">
                  <div className="text-[18px] font-bold tabular-nums">{tomorrowLabel} {tomorrowDateNum} {tomorrowWeekdayText}</div>
                </div>
              </WhiteBubble>
            </div>
          </div>
          <div className="shrink-0 mt-2 flex flex-col gap-1">
            {ipRow}
            {lunar ? <div className="text-[13px] text-white">农历 {lunar}</div> : null}
          </div>
          <div className="shrink-0 mt-1" data-nodrag>{noteRow}</div>
        </>
      )}
    </>
  );
}

export default function TimeWidget({
  layout,
  delay = 0,
  phone,
}: {
  /** 生效布局：注册表适配层传入；卡内按 colSpan/heightUnits 分档排布，与其它组件同尺寸口径 */
  layout: WidgetLayout;
  delay?: number;
  /** 手机单列呈现：宽按 1 栏算（与主页现状口径一致） */
  phone?: boolean;
}) {
  const { t } = useLang();
  const [now, setNow] = useState(() => new Date());
  const [data, setData] = useState<TimeWidgetData>(loadData);
  const [geo, setGeo] = useState<IpGeo | null>(null);
  const [ipState, setIpState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [copied, setCopied] = useState(false);
  const style = data.style ?? 'poster';

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
    } catch {
      /* 本地存不下也不影响显示 */
    }
  }, [data]);

  /** 位置：每次打开现取（走自家 /api，不直连第三方），失败可点重试 */
  const loadIp = async () => {
    setIpState('loading');
    const v = await fetchIp();
    if (v) {
      setGeo(v);
      setIpState('ok');
    } else {
      setIpState('error');
    }
  };
  useEffect(() => {
    loadIp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cols = phone ? 1 : layout.colSpan;
  const tall = layout.heightUnits === 2;
  const wide = cols === 2;
  const lunar = lunarText(now);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeText = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const secondsText = `:${pad(now.getSeconds())}`;
  const fullTime = `${timeText}${secondsText}`;
  const dateNum = `${now.getMonth() + 1}/${now.getDate()}`;
  const monthNum = String(now.getMonth() + 1);
  const dayNum = String(now.getDate());
  const weekdayText = `周${WEEKDAYS[now.getDay()]}`;
  const tomorrowDateNum = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`;
  const tomorrowWeekdayText = `周${WEEKDAYS[tomorrow.getDay()]}`;
  /** 上下午标记（横排/双日右栏，呼应海报的 PM） */
  const ampm = now.getHours() < 12 ? 'AM' : 'PM';

  /** 经纬度：英文缩写＋1 位小数＋°（N/S、E/W），如 N 1.3° E 103.9° */
  const formatLatLon = (lat: number, lon: number) =>
    `${lat >= 0 ? 'N' : 'S'} ${Math.abs(lat).toFixed(1)}° ${lon >= 0 ? 'E' : 'W'} ${Math.abs(lon).toFixed(1)}°`;
  /** 位置行文案：经纬度＋城市名；无归属地时回落到 IP */
  const locText = geo && typeof geo.lat === 'number' && typeof geo.lon === 'number'
    ? `${formatLatLon(geo.lat, geo.lon)}${geo.city ? ` · ${geo.city}` : ''}`
    : geo ? `IP ${geo.ip}` : '';

  /** 复制：时间＋位置（含农历与提醒） */
  const copyIp = async () => {
    if (!geo) return;
    const text = `${dateNum} ${weekdayText} ${timeText} ${lunar} ${locText}${data.note ? ` ${data.note}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  };

  /* 位置行（四种尺寸、四种风格共用）：归属地＋城市名，点按复制；无归属地时回落到 IP；未取到点按重试 */
  const ipRow = ipState === 'ok' && geo ? (
    <div className="flex items-center gap-1.5 min-w-0">
      <button
        onClick={copyIp}
        className="flex items-center gap-1.5 text-left text-[13px] text-[#A3A3A3] hover:text-white transition-colors min-w-0"
        title={copied ? t('widget.timeCopied') : locText}
      >
        <MapPin size={13} className="shrink-0" />
        <span className="tabular-nums">{locText}</span>
        <span className="shrink-0 text-[11px] text-white/35">{copied ? t('widget.timeCopied') : t('widget.timeTapCopy')}</span>
      </button>
    </div>
  ) : (
    <button
      onClick={loadIp}
      disabled={ipState === 'loading'}
      className="flex items-center gap-1.5 text-[13px] text-[#6B6B6B] hover:text-white transition-colors disabled:opacity-60"
    >
      <MapPin size={13} className="shrink-0" />
      {ipState === 'loading' ? t('widget.timeIpLoading') : t('widget.timeIpError')}
    </button>
  );

  /* 一句话提醒行（高卡共用）：无下划线，纯文字 */
  const noteRow = (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-md bg-white/10 text-white/60">{t('widget.timeNote')}</span>
      <input
        value={data.note ?? ''}
        maxLength={40}
        onChange={(e) => setData((d) => ({ ...d, note: e.target.value }))}
        placeholder={t('widget.timeNotePlaceholder')}
        className="flex-1 min-w-0 bg-transparent text-[13px] text-white placeholder:text-white/30 outline-none py-0.5"
      />
    </div>
  );

  const shared: StyleShared = {
    now,
    lunar,
    dateNum,
    monthNum,
    dayNum,
    timeText,
    secondsText,
    fullTime,
    weekdayText,
    tomorrowDateNum,
    tomorrowWeekdayText,
    ampm,
    todayLabel: t('widget.timeToday'),
    tomorrowLabel: t('widget.timeTomorrow'),
    wide,
    tall,
    phone,
    ipRow,
    noteRow,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      data-time-widget
      data-time-style={style}
      style={{ fontFamily: POSTER_FONT }}
      className="group-card-scope widget-panel relative rounded-[32px] h-full p-4 sm:p-5 flex flex-col overflow-hidden bg-black text-white"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative flex flex-col flex-1 min-h-0">
        {/* 风格切换：右上角 4 个按钮（点按即换，存独立 key） */}
        <div className="absolute top-0 right-0 z-10 flex gap-1" data-nodrag>
          {STYLE_IDS.map((id) => (
            <button
              key={id}
              onClick={() => setData((d) => ({ ...d, style: id }))}
              className={
                style === id
                  ? 'text-[10px] leading-none font-bold px-2 py-1 rounded-full bg-white text-black'
                  : 'text-[10px] leading-none px-2 py-1 rounded-full bg-white/10 text-white/60 hover:text-white'
              }
            >
              {t(STYLE_LABEL_KEYS[id])}
            </button>
          ))}
        </div>

        {style === 'poster' && <PosterStyle {...shared} />}
        {style === 'bubble' && <BubbleStyle {...shared} />}
      </div>
    </motion.div>
  );
}
