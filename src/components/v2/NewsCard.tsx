import React, { useEffect, useState } from 'react';
import { Newspaper, ChevronRight, RefreshCw } from 'lucide-react';
import { fetchNews, type NewsItem } from '../../services/api';
import { useLang } from '../../i18n/useLang';
import { Card, CardIconBadge } from './Card';

/** A 型 · AI 资讯卡：接现有新闻接口，露头条 + 热门榜，点击进资讯页
 *  时间组件同款：纯黑底 + POSTER_FONT（经 Card 壳），主白 / 次 #A3A3A3 / 强调色走 --widget-accent（默认标准蓝）；
 *  来源标识行（最热粉 + 分类靛蓝）是内容色，保留 */
export default function NewsCard({
  onNavigate,
  delay = 0,
  colorVars,
}: {
  onNavigate: (page: string) => void;
  delay?: number;
  /** 每卡自定义底色的两个 CSS 变量（注册表适配层算好传下），经 Card 壳挂到卡根 */
  colorVars?: React.CSSProperties;
}) {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { t, lang } = useLang();
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchNews(6)
      .then((data) => {
        if (!cancelled) setNews(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retry]);

  const headline = news[0];
  const hotList = news.slice(1, 5);

  return (
    <Card
      colorVars={colorVars}
      title={t('nav.newsCardTitle')}
      icon={
        <CardIconBadge className="bg-[var(--widget-accent)] text-white">
          <Newspaper size={14} />
        </CardIconBadge>
      }
      right={
        <span className="flex items-center gap-0.5 text-[11px] text-[#A3A3A3]">
          {t('nav.newsCardOpen')} <ChevronRight size={12} />
        </span>
      }
      onClick={() => onNavigate('news')}
      delay={delay}
    >
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <RefreshCw size={20} className="text-white/30 animate-spin" />
        </div>
      ) : headline ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* 头条 */}
          <div className="shrink-0">
            <div className="flex items-center gap-2 text-[11px] text-[#A3A3A3] mb-1.5">
              <span className="text-pink-300 font-semibold tracking-wide">{t('nav.newsCardHottest')}</span>
              <span>{headline.source}</span>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span className="text-indigo-300">{headline.category}</span>
            </div>
            <h4 className="text-lg sm:text-xl font-bold leading-snug tracking-tight line-clamp-2">{headline.title}</h4>
            {headline.description && (
              <p className="text-xs sm:text-sm text-[#A3A3A3] mt-1 line-clamp-1">{headline.description}</p>
            )}
          </div>
          {/* 热门榜 */}
          <div className="mt-3 pt-3 border-t border-white/10 flex-1 min-h-0 overflow-hidden">
            <p className="text-[10px] font-medium tracking-wider text-[#A3A3A3] uppercase mb-2">{t('nav.newsCardHotList')}</p>
            <div className="space-y-1">
              {hotList.map((item, idx) => (
                <button
                  key={item.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (item.url) window.open(item.url, '_blank');
                  }}
                  className="w-full flex items-center gap-2.5 px-1.5 py-1 rounded-lg hover:bg-white/5 text-left transition-colors"
                >
                  <span className="w-4.5 h-4.5 shrink-0 rounded bg-white/10 flex items-center justify-center text-[10px] font-bold text-[#A3A3A3]" style={{ width: 18, height: 18 }}>
                    {idx + 2}
                  </span>
                  <span className="flex-1 text-xs sm:text-[13px] text-white truncate">{item.title}</span>
                  <span className="text-[10px] text-[#A3A3A3] shrink-0">
                    {new Date(item.publishedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN', { month: '2-digit', day: '2-digit' })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-2 items-center justify-center text-sm text-[#A3A3A3]">
          <span>{t('nav.newsCardUnavailable')}</span>
          <button type="button" className="text-[var(--widget-accent)] hover:text-[color-mix(in_srgb,var(--widget-accent)_80%,transparent)]" onClick={(e) => {
            e.stopPropagation();
            setRetry((value) => value + 1);
          }}>{t('nav.newsCardRetry')}</button>
        </div>
      )}
    </Card>
  );
}
