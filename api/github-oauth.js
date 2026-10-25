// Vercel Serverless Function - GitHub OAuth 登录（同步用）
// 前端只拿公开的 client_id 拼授权 URL；换 token 必须带 client_secret，只能在服务端做。
// secret 只从环境变量读，绝不落库、绝不打日志、绝不出现在任何响应里。
// 环境变量：GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET（在 Vercel 项目里配置）。

export default async function handler(req, res) {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID || null;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET || null;

  // GET /api/github-oauth?config=1 → 只回公开配置（client_id 本来就是公开信息）
  if (req.method === 'GET') {
    if (req.query && req.query.config) {
      return res.status(200).json({ clientId, desktopLoginBridge: 1 });
    }
    return res.status(400).json({ error: 'bad_request' });
  }

  // POST /api/github-oauth { code } → { access_token }
  if (req.method === 'POST') {
    if (!clientId || !clientSecret) {
      return res.status(501).json({ error: 'oauth_not_configured' });
    }
    const code = req.body && typeof req.body.code === 'string' ? req.body.code : '';
    if (!code) {
      return res.status(400).json({ error: 'missing_code' });
    }
    try {
      const ghRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });
      const data = await ghRes.json().catch(() => null);
      // GitHub 对坏 code 也回 200 + { error }，以有没有 access_token 为准
      if (!ghRes.ok || !data || typeof data.access_token !== 'string' || !data.access_token) {
        return res.status(502).json({ error: (data && data.error) || 'token_exchange_failed' });
      }
      return res.status(200).json({ access_token: data.access_token });
    } catch {
      return res.status(502).json({ error: 'token_exchange_failed' });
    }
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
