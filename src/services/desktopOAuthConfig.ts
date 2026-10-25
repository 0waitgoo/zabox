/** The desktop must not wait for a callback from an outdated homepage. */
export function requireDesktopLoginService(value: unknown): void {
  const config = value as { clientId?: unknown; desktopLoginBridge?: unknown } | null;
  if (!config || typeof config.clientId !== 'string' || !config.clientId) throw new Error('官网尚未配置 GitHub 授权服务');
  if (config.desktopLoginBridge !== 1) throw new Error('官网授权页面尚未更新，请先发布网页授权更新');
}
