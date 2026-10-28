import React from 'react';
import { motion } from 'motion/react';
import { siteLogoFallback } from '../../data/groups';
import { toolsByCategory } from '../../data/navPool';

function NavPage() {
  const handleClick = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">
          AI网站导航
        </h2>
        <button
          type="button"
          data-nav-entertainment
          onClick={() => document.getElementById('nav-entertainment')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
        >
          娱乐导航
        </button>
      </div>
      {Object.entries(toolsByCategory).map(([category, tools], categoryIdx) => (
        <motion.div
          key={category}
          id={category === '娱乐导航' ? 'nav-entertainment' : undefined}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: categoryIdx * 0.05 }}
        >
          <div className="glass-panel rounded-[32px] p-6">
            <h3 className="font-semibold text-lg tracking-tight mb-4">{category}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {tools.map((tool, idx) => (
                <div
                  key={idx}
                  onClick={() => handleClick(tool.url)}
                  className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group cursor-pointer relative"
                >
                  <div className="site-icon-frame w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 bg-white">
                    <img 
                      src={tool.logo} 
                      alt={tool.name}
                      className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        // 无真实图标 → 站名首字字标（第八十四轮），不再用 DiceBear 随机图
                        if (!target.src.startsWith('data:')) target.src = siteLogoFallback(tool.name);
                      }}
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
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export default React.memo(NavPage);
