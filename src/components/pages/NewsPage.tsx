import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, ArrowUpRight, History, RefreshCw } from 'lucide-react';
import { fetchNews, type NewsItem } from '../../services/api';
import { useLang } from '../../i18n/useLang';

function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedNewsId, setExpandedNewsId] = useState<number | null>(null);
  const { t, lang } = useLang();
  const dateLocale = lang === 'en' ? 'en-US' : 'zh-CN';

  useEffect(() => {
    let cancelled = false;
    const loadNews = async () => {
      setLoading(true);
      try {
        const data = await fetchNews(30);
        if (!cancelled) setNews([...data].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)));
      } catch (error) {
        console.error('Failed to load news:', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadNews();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const handleRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
    setExpandedNewsId(null);
  }, []);

  const handleNewsClick = (newsId: number) => {
    setExpandedNewsId(expandedNewsId === newsId ? null : newsId);
  };

  const handleNewsLink = (url: string) => {
    if (url && url !== '#') {
      window.open(url, '_blank');
    }
  };

  const categorizeNews = (newsList: NewsItem[]) => {
    const now = new Date();
    const today = newsList.filter(item => {
      const itemDate = new Date(item.publishedAt);
      const diffHours = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60);
      return diffHours <= 24;
    });

    const yesterday = newsList.filter(item => {
      const itemDate = new Date(item.publishedAt);
      const diffHours = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60);
      return diffHours > 24 && diffHours <= 48;
    });

    const history = newsList.filter(item => {
      const itemDate = new Date(item.publishedAt);
      const diffHours = (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60);
      return diffHours > 48;
    });

    return { 
      today: today.slice(0, 10), 
      yesterday: yesterday.slice(0, 5), 
      history: history.slice(0, 10) 
    };
  };

  const { today, yesterday, history } = useMemo(() => categorizeNews(news), [news]);

  const renderNewsDetail = (newsItem: NewsItem) => (
    <div className="mt-4 pt-4 border-t border-white/10">
      {newsItem.image && (
        <div className="mb-4 rounded-xl overflow-hidden">
          <img
            src={newsItem.image}
            alt={newsItem.title}
            loading="lazy"
            className="w-full h-48 object-cover"
          />
        </div>
      )}
      <div className="text-white/80 text-base sm:text-lg leading-relaxed space-y-4">
        {newsItem.description && (
          <p>{newsItem.description}</p>
        )}
        <p className="text-white/60">
          {t('nav.newsMore')}
        </p>
      </div>
      {newsItem.url && newsItem.url !== '#' && (
        <button 
          onClick={() => handleNewsLink(newsItem.url)}
          className="mt-4 flex items-center gap-2 px-6 py-3 bg-indigo-500/80 hover:bg-indigo-600/90 backdrop-blur-md rounded-xl text-white font-medium transition-all shadow-lg shadow-indigo-500/20"
        >
          {t('nav.newsReadOriginal')}
          <ArrowUpRight size={18} />
        </button>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight">{t('nav.newsTitle')}</h2>
        </div>
        <div className="glass-panel rounded-[32px] p-8 border border-white/10">
          <div className="flex items-center justify-center gap-3 text-white/60">
            <RefreshCw size={20} className="animate-spin" />
            <span>{t('nav.newsLoading')}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {news.length === 0 && (
        <div className="glass-panel rounded-3xl p-8 text-center text-white/60">
          <p>{t('nav.newsPageEmpty')}</p>
          <button type="button" onClick={handleRefresh} className="mt-3 text-indigo-300">{t('nav.newsPageReload')}</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">{t('nav.newsTitle')}</h2>
        <button 
          onClick={handleRefresh}
          className="text-white/50 text-sm hover:text-white/80 transition-colors flex items-center gap-1"
        >
          <RefreshCw size={14} />
          {t('nav.newsRefresh')}
        </button>
      </div>

      {[
        { label: t('nav.newsToday'), data: today },
        { label: t('nav.newsYesterday'), data: yesterday },
        { label: t('nav.newsHistory'), data: history, isHistory: true }
      ].map(({ label, data, isHistory }) => data.length > 0 && (
        <div key={label}>
          {isHistory ? (
            <div>
              <h2 className="text-xl font-bold mb-4 tracking-tight flex items-center gap-2">
                <History size={20} />
                {label}
              </h2>
              <div className="glass-panel rounded-[32px] p-4 border border-white/10">
                <div className="space-y-2">
                  {data.map((item) => (
                    <div key={item.id}>
                      <div
                        onClick={() => handleNewsClick(item.id)}
                        className="flex items-center justify-between py-2 border-b border-white/5 last:border-0 group cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-white/60 text-xs">
                            {item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(dateLocale) : ''}
                          </span>
                          <span className="text-indigo-300 text-xs">{item.category}</span>
                          <span className="text-white/80 text-xs group-hover:text-white transition-colors max-w-[300px] truncate">
                            {item.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {expandedNewsId === item.id && (
                            <span className="text-white/50 text-xs">{t('nav.newsCollapse')}</span>
                          )}
                          <ArrowUpRight 
                            size={12} 
                            className={`text-white/30 group-hover:text-white/60 transition-colors ${expandedNewsId === item.id ? 'rotate-45' : ''}`} 
                          />
                        </div>
                      </div>
                      {expandedNewsId === item.id && (
                        <div className="mt-2 pb-2 text-white/70 text-sm leading-relaxed space-y-2">
                          <p>{item.description || t('nav.newsDetailFallback', { name: item.title })}</p>
                          {item.url && item.url !== '#' && (
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleNewsLink(item.url); }}
                              className="text-indigo-300 hover:text-indigo-200 text-xs"
                            >
                              {t('nav.newsViewOriginal')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold mb-4 tracking-tight">{label}</h2>
              <div className="space-y-4">
                {data.map((item, idx) => (
                  <div key={item.id}>
                    {idx === 0 ? (
                      <div
                        className="glass-panel rounded-[32px] p-6 relative overflow-hidden group cursor-pointer border border-white/10"
                      >
                        <div 
                          onClick={() => handleNewsClick(item.id)}
                          className="relative z-10"
                        >
                          <div className="flex justify-between items-start mb-4">
                            <span className="px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase bg-indigo-500/80 backdrop-blur-md rounded-full text-white shadow-lg shadow-indigo-500/20">
                              {item.category}
                            </span>
                            <button className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-colors border border-white/10">
                              <ArrowUpRight size={18} className={expandedNewsId === item.id ? 'rotate-45' : ''} />
                            </button>
                          </div>
                          <div className="flex items-center gap-2 text-white/70 text-xs mb-3 font-medium flex-wrap">
                            <Clock size={14} />
                            <span>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(dateLocale) : ''}</span>
                            <span className="w-1 h-1 rounded-full bg-white/30 mx-1"></span>
                            <span className="text-indigo-300">{item.source}</span>
                          </div>
                          <h3 className="text-2xl font-bold leading-[1.2] mb-3 group-hover:text-indigo-200 transition-colors tracking-tight">
                            {item.title}
                          </h3>
                          <p className="text-white/70 text-base line-clamp-3 max-w-full font-light leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                        {expandedNewsId === item.id && renderNewsDetail(item)}
                      </div>
                    ) : (
                      <div
                        className="glass-panel rounded-2xl p-4 group cursor-pointer border border-white/10 hover:bg-white/5 transition-all"
                      >
                        <div 
                          onClick={() => handleNewsClick(item.id)}
                          className="flex flex-col"
                        >
                          <div className="flex items-start gap-4">
                            {item.image && (
                              <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                                <img
                                  src={item.image}
                                  alt={item.title}
                                  loading="lazy"
                                  className="w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 text-white/50 text-xs mb-1">
                                <Clock size={12} />
                                <span>{item.publishedAt ? new Date(item.publishedAt).toLocaleDateString(dateLocale) : ''}</span>
                                <span className="text-indigo-300 text-xs">{item.source}</span>
                              </div>
                              <h4 className="text-sm font-semibold text-white/80 group-hover:text-white transition-colors truncate">
                                {item.title}
                              </h4>
                            </div>
                            <ArrowUpRight size={16} className={`text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0 ${expandedNewsId === item.id ? 'rotate-45' : ''}`} />
                          </div>
                        </div>
                        {expandedNewsId === item.id && (
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="mt-4 pt-4 border-t border-white/10"
                          >
                            {item.image && (
                              <div className="mb-3 rounded-lg overflow-hidden">
                                <img
                                  src={item.image}
                                  alt={item.title}
                                  loading="lazy"
                                  className="w-full h-32 object-cover"
                                />
                              </div>
                            )}
                            <p className="text-white/70 text-sm leading-relaxed">{item.description}</p>
                            {item.url && item.url !== '#' && (
                              <button 
                                onClick={() => handleNewsLink(item.url)}
                                className="mt-3 flex items-center gap-2 px-4 py-2 bg-indigo-500/80 hover:bg-indigo-600/90 backdrop-blur-md rounded-lg text-white text-sm font-medium transition-all"
                              >
                                {t('nav.newsReadOriginal')}
                                <ArrowUpRight size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default React.memo(NewsPage);
