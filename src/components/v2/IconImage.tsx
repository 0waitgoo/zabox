import React, { useEffect, useRef, useState } from 'react';
import { siteLogoFallback } from '../../data/groups';
import { loadIcon } from '../../utils/iconLoader';

/** 先显示本地字标；接近视口时才加载真实图标，各卡面共享同一解析任务。 */
export default function IconImage({ src, name, url, ...props }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError' | 'onLoad'> & {
  src: string; name: string; url?: string;
}) {
  const ref = useRef<HTMLImageElement>(null);
  const identity = JSON.stringify([src, name, url]);
  const [resolved, setResolved] = useState({ identity: '', src: '' });
  const fallback = src.startsWith('data:') || src.startsWith('blob:') ? src : siteLogoFallback(name);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void loadIcon(src, name, url).then((result) => {
        if (!cancelled) setResolved({ identity, src: result });
      });
    };
    let observer: IntersectionObserver | undefined;
    if (ref.current && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) { observer?.disconnect(); load(); }
      }, { rootMargin: '200px' });
      observer.observe(ref.current);
    } else load();
    return () => { cancelled = true; observer?.disconnect(); };
  }, [identity, src, name, url]);

  return <img {...props} ref={ref} src={resolved.identity === identity ? resolved.src : fallback}
    draggable={false} decoding="async" referrerPolicy="no-referrer"
    onError={() => setResolved({ identity, src: fallback })} />;
}
