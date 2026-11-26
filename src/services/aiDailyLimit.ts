/**
 * AI 每日限额（2026-11-26 用户令：每用户/每台机器每日最多 10 次 AI 搜索或 AI 功能）。
 * 只存本机 localStorage（zabox-ai-daily-usage），按机器计、天然每台机器一份，
 * 不同步、不进仓库、不进 store。
 * 口径：按 API 调用计（一次动作＝一次 callSiteAi 调用，见 siteAi.ts；Plan AI 同理）；
 * 测试连接（请只回一个字：好）与拉模型列表（/models）不是 AI 生成，不计。
 * 成功拿到有效内容才计数，失败（抛错/空内容）不计；localStorage 不可用时视为不限额，不拦用户。
 */

export const AI_DAILY_LIMIT = 10;

const USAGE_KEY = 'zabox-ai-daily-usage';

export interface AiDailyUsage {
  /** 本地日期 YYYY-MM-DD */
  date: string;
  count: number;
}

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 读今日用量：日期不是今天（跨天）则视为 0 次；读不到/非法一律视为 0 次 */
export function getAiDailyUsage(): AiDailyUsage {
  const today = todayStr();
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiDailyUsage>;
      if (parsed && typeof parsed === 'object' && parsed.date === today) {
        const count =
          typeof parsed.count === 'number' && Number.isFinite(parsed.count)
            ? Math.max(0, Math.floor(parsed.count))
            : 0;
        return { date: today, count };
      }
    }
  } catch {
    /* 读不到视为 0 次，不拦用户 */
  }
  return { date: today, count: 0 };
}

/** 今日剩余次数（最小 0） */
export function getAiDailyRemaining(): number {
  return Math.max(0, AI_DAILY_LIMIT - getAiDailyUsage().count);
}

/** 今日还能不能用 */
export function canUseAi(): boolean {
  return getAiDailyUsage().count < AI_DAILY_LIMIT;
}

/** 记一次成功调用：今天 count +1 写回；写盘失败不拦用户 */
export function recordAiUse(): void {
  try {
    const cur = getAiDailyUsage();
    localStorage.setItem(USAGE_KEY, JSON.stringify({ date: cur.date, count: cur.count + 1 }));
  } catch {
    /* 写盘失败不拦用户 */
  }
}
