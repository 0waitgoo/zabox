/**
 * 桌面计划应用的 AI 接口配置（第 4 轮，设置页用）：
 * 只存本机 localStorage（zabox-plan-ai-config），绝不进 store、不参与 GitHub 同步。
 * 提供商三档：DeepSeek / OpenAI / 自定义（自填接口地址与模型）。
 * 桌面 AI 整理直接调配置的 chat completions 接口，不走网站 /api。
 */

export type AiProvider = 'deepseek' | 'openai' | 'custom';

export interface AiConfig {
  provider: AiProvider;
  baseUrl: string;
  model: string;
  key: string;
}

const KEY = 'zabox-plan-ai-config';

export const AI_PROVIDER_DEFAULTS: Record<
  Exclude<AiProvider, 'custom'>,
  { baseUrl: string; model: string }
> = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
};

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiConfig>;
      if (parsed && typeof parsed === 'object') {
        const provider: AiProvider =
          parsed.provider === 'openai' || parsed.provider === 'custom' ? parsed.provider : 'deepseek';
        return {
          provider,
          baseUrl:
            typeof parsed.baseUrl === 'string' && parsed.baseUrl.trim()
              ? parsed.baseUrl.trim()
              : provider === 'custom'
                ? ''
                : AI_PROVIDER_DEFAULTS[provider].baseUrl,
          model:
            typeof parsed.model === 'string' && parsed.model.trim()
              ? parsed.model.trim()
              : provider === 'custom'
                ? ''
                : AI_PROVIDER_DEFAULTS[provider].model,
          key: typeof parsed.key === 'string' ? parsed.key : '',
        };
      }
    }
  } catch {
    /* 忽略，走默认 */
  }
  return {
    provider: 'deepseek',
    baseUrl: AI_PROVIDER_DEFAULTS.deepseek.baseUrl,
    model: AI_PROVIDER_DEFAULTS.deepseek.model,
    key: '',
  };
}

export function saveAiConfig(cfg: AiConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* 忽略 */
  }
}
