import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Clock, MapPin } from 'lucide-react';
import { useLang } from '../../i18n/useLang';
import type { WidgetLayout, WidgetTint } from '../../store/localStore';
import WidgetTintLayer from '../v2/WidgetTint';

/**
 * 时间小组件（2026-11-21，用户令：把时间小工具加进杂盒小组件，尺寸匹配）：
 * 黑底白字海报风（与独立版时间小工具同款），实时走字时钟 + 日期/星期 + 农历 + 定位地址 + 一句话提醒。
 * 尺寸感知：1x1 只放时间与日期；2x1 加农历；高卡（2x）再加定位与提醒输入。
 * 定位地址与提醒句是组件自有数据，存独立 key（ainav-widget-time-data），不进主仓、不参与同步。
 */

/** 组件自有数据 key（注册表 storage 声明登记） */
const DATA_KEY = 'ainav-widget-time-data';

interface TimeWidgetData {
  address?: string;
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

/** 经纬度反查地址：先走 Nominatim（中文），拉不到再走 BigDataCloud 兜底；都拉不到返回 null */
async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&accept-language=zh-CN`,
      { headers: { Accept: 'application/json' } },
    );
    if (r.ok) {
      const j = await r.json();
      const a = j?.address ?? {};
      const parts = [
        a.state || a.province || a.city || '',
        a.city_district || a.county || a.district || '',
        a.suburb || a.town || a.village || '',
        a.road || '',
        a.house_number || '',
      ].filter(Boolean);
      if (parts.length > 0) return parts.join('·');
      if (typeof j?.display_name === 'string' && j.display_name) {
        return j.display_name.split(',').slice(0, 3).join('·');
      }
    }
  } catch {
    /* 走兜底 */
  }
  try {
    const r = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=zh`,
    );
    if (r.ok) {
      const j = await r.json();
      const parts = [j?.countryName || '', j?.principalSubdivision || '', j?.city || '', j?.locality || ''].filter(Boolean);
      if (parts.length > 0) return parts.join('·');
    }
  } catch {
    /* 无地址 */
  }
  return null;
}

function loadData(): TimeWidgetData {
  try {
    return JSON.parse(localStorage.getItem(DATA_KEY) ?? '{}') as TimeWidgetData;
  } catch {
    return {};
  }
}

export default function TimeWidget({
  tint,
  layout,
  delay = 0,
  phone,
}: {
  tint?: WidgetTint;
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

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeText = `${pad(now.getHours())}.${pad(now.getMinutes())}`;
  const secondsText = `:${pad(now.getSeconds())}`;
  const dateText = `${now.getMonth() + 1}/${now.getDate()} 周${WEEKDAYS[now.getDay()]}`;
  /** 大字尺寸随格子走：2x2 海报最大，1x1 最小，与卡格尺寸匹配、不溢出 */
  const timeSize = cols === 2 && tall ? 'text-[64px] sm:text-[76px]' : wide ? 'text-[52px]' : tall ? 'text-[48px]' : 'text-[40px]';

  const locate = () => {
    if (!('geolocation' in navigator)) {
      setLocState('error');
      return;
    }
    setLocState('loading');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const addr = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (addr) {
          setData((d) => ({ ...d, address: addr }));
          setLocState('idle');
        } else {
          setLocState('error');
        }
      },
      () => setLocState('denied'),
      { timeout: 10000 },
    );
  };

  const copyAddress = async () => {
    if (!data.address) return;
    try {
      await navigator.clipboard.writeText(data.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      /* 剪贴板不可用时静默失败 */
    }
  };

  const tintLayer = tint ? <WidgetTintLayer tint={tint} emoji="🕐" /> : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      data-time-widget
      className="group-card-scope widget-panel relative rounded-[32px] h-full p-4 sm:p-5 flex flex-col overflow-hidden bg-black text-white"
      onClick={(e) => e.stopPropagation()}
    >
      {tintLayer}
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

        <div className="flex-1 min-h-0 flex flex-col justify-center">
          <div className={`font-black tabular-nums tracking-tight leading-none ${timeSize}`}>
            {timeText}
            <span className="text-white/35 text-[0.45em] align-top">{secondsText}</span>
          </div>
          <div className="mt-2 text-sm sm:text-base text-white/75 font-medium">
            {dateText}
            {(wide || tall) && lunar ? <span className="text-white/40"> · {lunar}</span> : null}
          </div>
        </div>

        {tall ? (
          <div className="shrink-0 flex flex-col gap-2 mt-1" data-nodrag>
            {data.address ? (
              <button
                onClick={copyAddress}
                className="flex items-center gap-1.5 text-left text-[13px] text-white/75 hover:text-white transition-colors min-w-0"
                title={copied ? '已复制' : data.address}
              >
                <MapPin size={13} className="shrink-0 text-white/40" />
                <span className="flex-1 min-w-0 truncate">{data.address}</span>
                <span className="shrink-0 text-[11px] text-white/35">{copied ? '已复制' : '点按复制'}</span>
              </button>
            ) : (
              <button
                onClick={locate}
                disabled={locState === 'loading'}
                className="flex items-center gap-1.5 text-[13px] text-white/60 hover:text-white transition-colors disabled:opacity-60"
              >
                <MapPin size={13} className="shrink-0" />
                {locState === 'loading'
                  ? t('widget.timeLocating')
                  : locState === 'denied' || locState === 'error'
                    ? t('widget.timeLocDenied')
                    : t('widget.timeGetLocation')}
              </button>
            )}
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
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
