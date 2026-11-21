import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Clock, MapPin } from 'lucide-react';
import { useLang } from '../../i18n/useLang';
import type { WidgetLayout } from '../../store/localStore';

/**
 * 时间小组件（2026-11-21 晚重做：按分享版时间小工具的海报设计，字体一致）：
 * 纯黑海报 + 系统无衬线粗体大字（分享版同款：无网络字体，Arial/Helvetica 风格粗体），
 * 四种版式按尺寸走：1x1 紧凑 / 2x1 横排 / 1x2 大字 / 2x2 双日；星期用带圈字；秒数点分隔。
 * 定位只在设备上取经纬度（不联网反查，与分享版一致），显示经纬度 + 地图链接，
 * 点按复制时间＋经纬度＋地图链接。海报就是纯黑，不挂底色层（故不接 tint）。
 * 经纬度与提醒句是组件自有数据，存独立 key（ainav-widget-time-data），不进主仓、不参与同步。
 */

/** 海报字体：与分享版一致——系统无衬线（Arial/Helvetica 风格），无网络字体 */
const POSTER_FONT = '"Arial", "Helvetica Neue", Helvetica, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 组件自有数据 key（注册表 storage 声明登记） */
const DATA_KEY = 'ainav-widget-time-data';

interface TimeWidgetData {
  coords?: string;
  mapUrl?: string;
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
  const [locState, setLocState] = useState<'idle' | 'loading' | 'denied' | 'error'>('idle');
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

  /** 定位：只在设备上取经纬度，不联网反查（与分享版一致） */
  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocState('error');
      return;
    }
    setLocState('loading');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const coords = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        const mapUrl = `https://www.google.com/maps?q=${latitude.toFixed(4)},${longitude.toFixed(4)}`;
        setData((d) => ({ ...d, coords, mapUrl }));
        setLocState('idle');
      },
      () => setLocState('denied'),
      { timeout: 10000 },
    );
  };

  /** 复制：时间＋经纬度＋地图链接（含农历与提醒，与分享版一致） */
  const copyLocation = async () => {
    if (!data.coords || !data.mapUrl) return;
    const text = `${dateNum} ${weekdayText} ${timeText} ${lunar} ${data.coords} ${data.mapUrl}${data.note ? ` ${data.note}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  };

  /* 定位行（2x1/1x2/2x2 共用）：未定位点按获取；已定位点按复制经纬度，另附地图链接 */
  const locationRow = data.coords ? (
    <div className="flex items-center gap-1.5 min-w-0">
      <button
        onClick={copyLocation}
        className="flex items-center gap-1.5 text-left text-[13px] text-[#A3A3A3] hover:text-white transition-colors min-w-0"
        title={copied ? t('widget.timeCopied') : data.coords}
      >
        <MapPin size={13} className="shrink-0" />
        <span className="flex-1 min-w-0 truncate tabular-nums">{data.coords}</span>
        <span className="shrink-0 text-[11px] text-white/35">{copied ? t('widget.timeCopied') : t('widget.timeTapCopy')}</span>
      </button>
      <a
        href={data.mapUrl}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 text-[12px] text-white underline underline-offset-2 decoration-white/40 hover:decoration-white"
      >
        {t('widget.timeViewMap')}
      </a>
    </div>
  ) : (
    <button
      onClick={locate}
      disabled={locState === 'loading'}
      className="flex items-center gap-1.5 text-[13px] text-[#6B6B6B] hover:text-white transition-colors disabled:opacity-60"
    >
      <MapPin size={13} className="shrink-0" />
      {locState === 'loading'
        ? t('widget.timeLocating')
        : locState === 'denied' || locState === 'error'
          ? t('widget.timeLocDenied')
          : t('widget.timeLocPlaceholder')}
    </button>
  );

  /* 一句话提醒行（高卡共用） */
  const noteRow = (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-md bg-white/10 text-white/60">{t('widget.timeNote')}</span>
      <input
        value={data.note ?? ''}
        maxLength={40}
        onChange={(e) => setData((d) => ({ ...d, note: e.target.value }))}
        placeholder={t('widget.timeNotePlaceholder')}
        className="flex-1 min-w-0 bg-transparent text-[13px] text-white placeholder:text-white/30 outline-none border-b border-white/15 focus:border-white/40 py-0.5"
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
        <div className="flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-full bg-white text-black flex items-center justify-center shrink-0">
              <Clock size={14} />
            </div>
            <h3 className="font-semibold text-base sm:text-lg tracking-tight truncate">{t('widget.nameTime')}</h3>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-white/40 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            {t('widget.live')}
          </span>
        </div>

        {/* 1x1 紧凑：TIME 年份 + 大日期 + 时间 PM 星期 + 农历 */}
        {!wide && !tall && (
          <div className="flex-1 min-h-0 flex flex-col justify-center">
            <div className="text-[11px] tracking-[0.3em] text-[#A3A3A3]">TIME {now.getFullYear()}</div>
            <div className="mt-1 font-black tabular-nums leading-none tracking-tight text-[44px]">{dateNum}</div>
            <div className="mt-1.5 text-[15px] font-bold tabular-nums">
              {fullTime} <span className="text-[#A3A3A3] font-medium text-[13px]">{ampm} {weekdayText}</span>
            </div>
            {lunar ? <div className="mt-1.5 text-[12px] text-white/90">农历 {lunar}</div> : null}
          </div>
        )}

        {/* 2x1 横排：左 TIME/年份｜中大日期｜右 PM+带圈星期/全时间；下方定位 + 农历 */}
        {wide && !tall && (
          <>
            <div className="flex-1 min-h-0 flex items-center gap-4">
              <div className="shrink-0">
                <div className="text-[11px] tracking-[0.25em] text-[#A3A3A3]">TIME</div>
                <div className="font-black tabular-nums leading-none text-[22px]">{now.getFullYear()}</div>
              </div>
              <div className="flex-1 min-w-0 text-center font-black tabular-nums leading-none tracking-tight text-[56px]">{dateNum}</div>
              <div className="shrink-0 flex flex-col items-end">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13px] text-[#A3A3A3]">{ampm}</span>
                  <CircledWeekday ch={WEEKDAYS[now.getDay()]} className="w-5 h-5 text-[12px]" />
                </div>
                <div className="mt-1 font-black tabular-nums leading-none text-[24px]">{fullTime}</div>
              </div>
            </div>
            <div className="shrink-0 mt-1 flex flex-col gap-1">
              {locationRow}
              {lunar ? <div className="text-[12px] text-white/90">农历 {lunar}</div> : null}
            </div>
          </>
        )}

        {/* 1x2 大字：竖排年份 + 超大日期 + 带圈星期；大时间 + 灰秒；农历；定位 + 提醒 */}
        {!wide && tall && (
          <>
            <div className="flex-1 min-h-0 flex flex-col justify-center">
              <div className="flex items-center gap-3">
                <div className="flex flex-col font-black tabular-nums leading-none text-[28px] shrink-0">
                  <span>{String(now.getFullYear()).slice(0, 2)}</span>
                  <span>{String(now.getFullYear()).slice(2)}</span>
                </div>
                <div className="flex-1 min-w-0 font-black tabular-nums leading-none tracking-tight text-[60px]">{dateNum}</div>
                <CircledWeekday ch={WEEKDAYS[now.getDay()]} className="w-7 h-7 text-[15px]" />
              </div>
              <div className="mt-2 font-black tabular-nums leading-none tracking-tight text-[44px]">
                {timeText}
                <span className="text-[#A3A3A3] text-[0.45em] align-top">{secondsText}</span>
              </div>
              {lunar ? <div className="mt-2 text-[14px] text-white/90">农历 {lunar}</div> : null}
            </div>
            <div className="shrink-0 flex flex-col gap-2 mt-1" data-nodrag>
              {locationRow}
              {noteRow}
            </div>
          </>
        )}

        {/* 2x2 双日：今日｜明日 */}
        {wide && tall && (
          <>
            <div className="flex-1 min-h-0 flex gap-4">
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-[11px] tracking-[0.25em] text-[#A3A3A3]">{t('widget.timeToday')}</div>
                <div className="mt-1 font-black tabular-nums leading-none tracking-tight text-[52px]">{dateNum}</div>
                <div className="mt-2 font-black tabular-nums leading-none tracking-tight text-[28px]">
                  {timeText}
                  <span className="text-[#A3A3A3] text-[0.5em] align-top">{secondsText}</span>
                </div>
                <div className="mt-2 min-w-0">{locationRow}</div>
                {lunar ? <div className="mt-1.5 text-[13px] text-white/90 truncate">农历 {lunar}</div> : null}
              </div>
              <div className="w-px self-stretch my-2 bg-white/15 shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="text-[11px] tracking-[0.25em] text-[#A3A3A3]">{t('widget.timeTomorrow')}</div>
                <div className="mt-1 font-black tabular-nums leading-none tracking-tight text-[52px]">{tomorrowDateNum}</div>
                <div className="mt-2 text-[26px] font-bold">
                  <span className="text-[#A3A3A3]">{ampm} </span>
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
