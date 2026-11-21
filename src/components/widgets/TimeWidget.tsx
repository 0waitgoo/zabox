import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Globe } from 'lucide-react';
import { useLang } from '../../i18n/useLang';
import { fetchIp } from '../../services/api';
import type { WidgetLayout } from '../../store/localStore';

/**
 * 时间小组件（2026-11-21 晚，按分享版海报设计重做后用户再改）：
 * 纯黑海报 + 系统无衬线粗体大字（分享版同款：无网络字体，Arial/Helvetica 风格粗体），
 * 四种版式按尺寸走：1x1 紧凑 / 2x1 横排 / 1x2 大字 / 2x2 双日；星期用带圈字；秒数点分隔。
 * 无标题栏（纯海报）；提醒输入无下划线。
 * 字阶（平面设计口径）：眉标 10px/宽距/中粗 → 主数字 900 → 时间 800 → 次级 700 → 正文 400，
 * 数字特粗、字距紧，标签字距宽，形成黑白灰三档层次。
 * IP 行：只显示本机公网 IP（走自家 /api?type=ip，网站与扩展同路，不直连第三方），
 * 不显示地址/经纬度/地图链接；点按复制时间＋IP。IP 每次打开现取，不存。
 * 提醒句是组件自有数据，存独立 key（ainav-widget-time-data），不进主仓、不参与同步。
 * 海报就是纯黑，不挂底色层（故不接 tint）。
 */

/** 海报字体：与分享版一致——系统无衬线（Arial/Helvetica 风格），无网络字体 */
const POSTER_FONT = '"Arial", "Helvetica Neue", Helvetica, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 组件自有数据 key（注册表 storage 声明登记） */
const DATA_KEY = 'ainav-widget-time-data';

interface TimeWidgetData {
  note?: string;
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
    return JSON.parse(localStorage.getItem(DATA_KEY) ?? '{}') as TimeWidgetData;
  } catch {
    return {};
  }
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
  const [ip, setIp] = useState<string | null>(null);
  const [ipState, setIpState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [copied, setCopied] = useState(false);

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

  /** IP：每次打开现取（走自家 /api，不直连第三方），失败可点重试 */
  const loadIp = async () => {
    setIpState('loading');
    const v = await fetchIp();
    if (v) {
      setIp(v);
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
  const timeText = `${pad(now.getHours())}.${pad(now.getMinutes())}`;
  const secondsText = `.${pad(now.getSeconds())}`;
  const fullTime = `${timeText}${secondsText}`;
  const dateNum = `${now.getMonth() + 1}/${now.getDate()}`;
  const weekdayText = `周${WEEKDAYS[now.getDay()]}`;
  const tomorrowDateNum = `${tomorrow.getMonth() + 1}/${tomorrow.getDate()}`;
  const tomorrowWeekdayText = `周${WEEKDAYS[tomorrow.getDay()]}`;
  /** 上下午标记（横排/双日右栏，呼应海报的 PM） */
  const ampm = now.getHours() < 12 ? 'AM' : 'PM';

  /** 复制：时间＋IP（含农历与提醒） */
  const copyIp = async () => {
    if (!ip) return;
    const text = `${dateNum} ${weekdayText} ${timeText} ${lunar} IP ${ip}${data.note ? ` ${data.note}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  };

  /* IP 行（四种尺寸共用）：已取到点按复制；未取到点按重试 */
  const ipRow = ipState === 'ok' && ip ? (
    <div className="flex items-center gap-1.5 min-w-0">
      <button
        onClick={copyIp}
        className="flex items-center gap-1.5 text-left text-[13px] text-[#A3A3A3] hover:text-white transition-colors min-w-0"
        title={copied ? t('widget.timeCopied') : ip}
      >
        <Globe size={13} className="shrink-0" />
        <span className="tabular-nums">IP {ip}</span>
        <span className="shrink-0 text-[11px] text-white/35">{copied ? t('widget.timeCopied') : t('widget.timeTapCopy')}</span>
      </button>
    </div>
  ) : (
    <button
      onClick={loadIp}
      disabled={ipState === 'loading'}
      className="flex items-center gap-1.5 text-[13px] text-[#6B6B6B] hover:text-white transition-colors disabled:opacity-60"
    >
      <Globe size={13} className="shrink-0" />
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      data-time-widget
      style={{ fontFamily: POSTER_FONT }}
      className="group-card-scope widget-panel relative rounded-[32px] h-full p-4 sm:p-5 flex flex-col overflow-hidden bg-black text-white"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative flex flex-col flex-1 min-h-0">
        {/* 1x1 紧凑：TIME 年份 + 大日期 + 时间 PM 星期 + IP + 农历 */}
        {!wide && !tall && (
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            <div className="text-[10px] tracking-[0.35em] font-medium text-[#A3A3A3]">TIME {now.getFullYear()}</div>
            <div className="mt-1 font-black tabular-nums leading-none tracking-tight text-[46px]">{dateNum}</div>
            <div className="mt-1.5 text-[14px] font-bold tabular-nums">
              {fullTime} <span className="text-[#A3A3A3] font-medium text-[13px]">{ampm} {weekdayText}</span>
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
                <div className="font-bold tabular-nums leading-none text-[20px]">{now.getFullYear()}</div>
              </div>
              <div className="flex-1 min-w-0 text-center font-black tabular-nums leading-none tracking-tight text-[56px]">{dateNum}</div>
              <div className="shrink-0 flex flex-col items-end">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-[#A3A3A3]">{ampm}</span>
                  <CircledWeekday ch={WEEKDAYS[now.getDay()]} className="w-5 h-5 text-[12px]" />
                </div>
                <div className="mt-1 font-extrabold tabular-nums leading-none text-[22px]">{fullTime}</div>
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
              <div className="flex items-center gap-3">
                <div className="flex flex-col font-bold tabular-nums leading-[0.95] text-[24px] shrink-0">
                  <span>{String(now.getFullYear()).slice(0, 2)}</span>
                  <span>{String(now.getFullYear()).slice(2)}</span>
                </div>
                <div className="flex-1 min-w-0 font-black tabular-nums leading-none tracking-tight text-[62px]">{dateNum}</div>
                <CircledWeekday ch={WEEKDAYS[now.getDay()]} className="w-7 h-7 text-[15px]" />
              </div>
              <div className="mt-2.5 font-extrabold tabular-nums leading-none tracking-tight text-[40px]">
                {timeText}
                <span className="text-[#A3A3A3] font-medium text-[0.45em] align-top">{secondsText}</span>
              </div>
              {lunar ? <div className="mt-3 text-[14px] text-white">农历 {lunar}</div> : null}
            </div>
            <div className="shrink-0 flex flex-col gap-2.5 mt-1" data-nodrag>
              {ipRow}
              {noteRow}
            </div>
          </>
        )}

        {/* 2x2 双日：今日｜明日 */}
        {wide && tall && (
          <>
            <div className="flex-1 min-h-0 flex gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-[10px] tracking-[0.35em] font-medium text-[#A3A3A3]">{t('widget.timeToday')}</div>
                <div className="mt-1 font-black tabular-nums leading-none tracking-tight text-[52px]">{dateNum}</div>
                <div className="mt-2 font-extrabold tabular-nums leading-none tracking-tight text-[26px]">
                  {timeText}
                  <span className="text-[#A3A3A3] font-medium text-[0.5em] align-top">{secondsText}</span>
                </div>
                <div className="mt-2.5 min-w-0">{ipRow}</div>
                {lunar ? <div className="mt-1.5 text-[13px] text-white truncate">农历 {lunar}</div> : null}
              </div>
              <div className="w-px self-stretch my-2 bg-white/15 shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-[10px] tracking-[0.35em] font-medium text-[#A3A3A3]">{t('widget.timeTomorrow')}</div>
                <div className="mt-1 font-black tabular-nums leading-none tracking-tight text-[52px]">{tomorrowDateNum}</div>
                <div className="mt-2 text-[24px] font-bold">
                  <span className="text-[#A3A3A3] font-medium">{ampm} </span>
                  {tomorrowWeekdayText}
                </div>
              </div>
            </div>
            <div className="shrink-0 mt-1" data-nodrag>
              {noteRow}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
