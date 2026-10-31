import { autoSiteLogo, type NavGroup, type SiteEntry } from '../data/groups';

/**
 * 补图标扫描（2026-10-31）：不走 AI、不走任何 favicon 服务，只试站点自己的地址。
 * 判定口径与渲染兜底链一致（见 Card.tsx nextFallbackIconSrc）：本地品牌图标 → 本站
 * /favicon.ico → 字母。扫描只处理“当前显示字标”的站：手动设过文字图标、自己上传
 * 过图标的站一律跳过；已有远端地址的站先验证现地址，加载成功就不动。
 * 候选只取三处：种子库已知的同域品牌图标、本站 /favicon.ico、本站 apple-touch-icon；
 * 全部加载失败的站保持字标不动。写回前必须经面板逐项确认（调用方负责）。
 */

/** 图片可加载性探测（默认走浏览器 Image；单元测试可注入假实现） */
export type ImageLoader = (url: string, timeoutMs: number) => Promise<boolean>;

export function probeImageUrl(url: string, timeoutMs = 4000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (ok: boolean) => {
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
  });
}

type ProbeKind = 'skip' | 'fill' | 'verify';

/** 该站是否参与补图标：skip = 手动图标/本地品牌图/无 id（无法定位写回）；fill = 无可用地址；verify = 有远端地址待验证 */
export function iconFillProbeKind(site: SiteEntry): ProbeKind {
  if (site.iconMode === 'text' || site.iconMode === 'upload') return 'skip';
  if (!site.id) return 'skip';
  const logo = (site.logo ?? '').trim();
  if (!logo) return 'fill';
  if (logo.startsWith('data:')) return 'fill';
  if (logo.startsWith('/')) return 'skip';
  return 'verify';
}

/** 该站的候选图标地址（去重，顺序即尝试顺序；不含 data: 兜底图） */
export function iconFillCandidates(site: SiteEntry): string[] {
  const out: string[] = [];
  const push = (u: string | undefined) => {
    if (u && !u.startsWith('data:') && !out.includes(u)) out.push(u);
  };
  try {
    const origin = new URL(site.url).origin;
    push(autoSiteLogo(site.name, site.url));
    push(`${origin}/favicon.ico`);
    push(`${origin}/apple-touch-icon.png`);
  } catch {
    push(autoSiteLogo(site.name, site.url));
  }
  return out;
}

export interface IconFillHit {
  groupId: string;
  groupName: string;
  siteId: string;
  siteName: string;
  /** 验证通过的图标地址（写回 site.logo 用） */
  logo: string;
}

export interface IconFillScan {
  hits: IconFillHit[];
  /** 进入验证/补齐流程的站数 */
  scanned: number;
  /** 跳过的站数（手动图标/本地品牌图/无 id） */
  skipped: number;
  /** 候选全部加载失败的站数 */
  notFound: number;
}

/** 扫当前编组：并发验证，onProgress 报告已完成/总数；单个站超时默认 4 秒 */
export async function scanIconFill(
  groups: NavGroup[],
  load: ImageLoader = probeImageUrl,
  onProgress?: (done: number, total: number) => void,
  opts?: { concurrency?: number; timeoutMs?: number },
): Promise<IconFillScan> {
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const concurrency = Math.max(1, opts?.concurrency ?? 4);
  type Job = { groupId: string; groupName: string; site: SiteEntry };
  const jobs: Job[] = [];
  let skipped = 0;
  for (const g of groups) {
    for (const s of g.sites) {
      if (iconFillProbeKind(s) === 'skip') skipped++;
      else jobs.push({ groupId: g.id, groupName: g.name, site: s });
    }
  }
  const total = jobs.length;
  const hits: IconFillHit[] = [];
  let notFound = 0;
  let done = 0;
  const report = () => onProgress?.(done, total);
  const runOne = async (job: Job): Promise<void> => {
    const { site } = job;
    const logo = (site.logo ?? '').trim();
    // 有远端地址的站：现地址能加载就不动
    if (iconFillProbeKind(site) === 'verify' && logo && (await load(logo, timeoutMs))) {
      done++;
      report();
      return;
    }
    for (const cand of iconFillCandidates(site)) {
      if (cand === logo) continue;
      if (await load(cand, timeoutMs)) {
        hits.push({
          groupId: job.groupId,
          groupName: job.groupName,
          siteId: site.id as string,
          siteName: site.name,
          logo: cand,
        });
        done++;
        report();
        return;
      }
    }
    notFound++;
    done++;
    report();
  };
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, total)) }, async () => {
    while (idx < total) {
      const job = jobs[idx++];
      await runOne(job);
    }
  });
  await Promise.all(workers);
  report();
  return { hits, scanned: total, skipped, notFound };
}
