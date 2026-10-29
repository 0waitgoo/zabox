import React, { useState } from 'react';
import { motion } from 'motion/react';
import IconImage from '../v2/IconImage';
import { toolsByCategory } from '../../data/navPool';

/** 娱乐六分类（与 navPool 娱乐分组同名）：筛选时只留这六组 */
const ENT_CATEGORIES = ['视频', '二次元', '音乐', '阅读', '游戏', '娱乐'];

function NavPage() {
  // 娱乐筛选（2026-10-28 晚）：点“娱乐导航”只显示娱乐六分类，再点“全部网站”回到全部
  const [entOnly, setEntOnly] = useState(false);
  const visibleEntries = Object.entries(toolsByCategory).filter(
    ([category]) => !entOnly || ENT_CATEGORIES.includes(category),
  );

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">
          {entOnly ? '娱乐导航' : 'AI网站导航'}
        </h2>
        <button
          type="button"
          data-nav-entertainment
          onClick={() => setEntOnly(!entOnly)}
          className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          {entOnly ? '全部网站' : '娱乐导航'}
        </button>
      </div>
      {visibleEntries.map(([category, tools], categoryIdx) => (
        <motion.div
          key={category}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: categoryIdx * 0.05 }}
        >
          <div className="group-card-panel rounded-[32px] p-6">
            <h3 className="font-semibold text-lg tracking-tight mb-4">{category}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {tools.map((tool, idx) => (
                <a
                  key={idx}
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-nav-site
                  className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group cursor-pointer relative"
                >
                  <div className="site-icon-frame w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 bg-white">
                    <IconImage
                      src={tool.logo} 
                      name={tool.name}
                      url={tool.url}
                      alt={tool.name}
                      className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0 pr-1">
                    <span className="text-xs sm:text-sm font-medium text-white/80 group-hover:text-white transition-colors block truncate">
                      {tool.name}
                    </span>
                    <p className="text-[10px] sm:text-xs text-white/50 mt-0.5 group-hover:text-white/70 transition-colors line-clamp-1">
                      {tool.description}
                    </p>
                  </div>
                  {tool.needVpn && (
                    <span className="absolute top-1.5 right-1.5 text-[8px] font-bold text-white/40 bg-white/10 px-1.5 py-0.5 rounded">VPN</span>
                  )}
                </a>
              ))}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export default React.memo(NavPage);
