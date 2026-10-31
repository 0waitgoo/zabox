// Vercel Serverless Function - Gitee OAuth 登录（同步用，与 api/github-oauth.js 镜像）
// 前端只拿公开的 client_id 拼授权 URL；换 token 与刷新 token 必须带 client_secret，只能在服务端做。
// secret 只从环境变量读，绝不落库、绝不打日志、绝不出现在任何响应里。
// 环境变量：GITEE_OAUTH_CLIENT_ID / GITEE_OAUTH_CLIENT_SECRET（在 Vercel 项目里配置）。
// Gitee 的 access_token 一天过期（expires_in=86400），前端凭 refresh_token 找本接口刷新。

export default async function handler(req, res) {
  const clientId = process.env.GITEE_OAUTH_CLIENT_ID || null;
  const clientSecret = process.env.GITEE_OAUTH_CLIENT_SECRET || null;

  // GET /api/gitee-oauth?config=1 → 只回公开配置（client_id 本来就是公开信息）
  if (req.method === 'GET') {
    if (req.query && req.query.config) {
      return res.status(200).json({ clientId });
    }
    return res.status(400).json({ error: 'bad_request' });
  }

  // POST /api/gitee-oauth { code, redirect_uri } → { access_token, refresh_token, expires_in }
  // POST /api/gitee-oauth { refresh_token } → { access_token, refresh_token, expires_in }
  if (req.method === 'POST') {
    if (!clientId || !clientSecret) {
      return res.status(501).json({ error: 'oauth_not_configured' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const code = typeof body.code === 'string' ? body.code : '';
    const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : '';
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    // Gitee 换令牌接口按官方示例用查询参数 POST（与 code 换 token、refresh_token 刷新同一接口）
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
    });
    if (refreshToken) {
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', refreshToken);
    } else {
      if (!code) {
        return res.status(400).json({ error: 'missing_code' });
      }
      params.set('grant_type', 'authorization_code');
      params.set('code', code);
      if (redirectUri) params.set('redirect_uri', redirectUri);
    }
    try {
      const geRes = await fetch(`https://gitee.com/oauth/token?${params.toString()}`, { method: 'POST' });
      const data = await geRes.json().catch(() => null);
      if (!geRes.ok || !data || typeof data.access_token !== 'string' || !data.access_token) {
        return res.status(502).json({ error: (data && data.error) || 'token_exchange_failed' });
      }
      return res.status(200).json({
        access_token: data.access_token,
        refresh_token: typeof data.refresh_token === 'string' ? data.refresh_token : '',
        expires_in: typeof data.expires_in === 'number' ? data.expires_in : 0,
      });
    } catch {
      return res.status(502).json({ error: 'token_exchange_failed' });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
