import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { fetchNews, requestJson } from '../src/services/api';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test('failed news requests return an empty list instead of fabricated headlines', async () => {
  for (const response of [
    new Response('unavailable', { status: 503 }),
    Response.json({ success: false }),
    Response.json({ success: true, data: {} }),
    new Response('<html>proxy error</html>'),
  ]) {
    globalThis.fetch = async () => response;
    assert.deepEqual(await fetchNews(), []);
  }
});

test('successful news requests preserve server pagination and publication dates', async () => {
  const items = [{ id: 1, title: 'Server headline', url: 'https://example.com/news/1', publishedAt: '2026-10-01T00:00:00Z' }];
  globalThis.fetch = async (url) => {
    assert.equal(url, '/api?type=news&limit=5&offset=10');
    return Response.json({ success: true, data: items });
  };
  assert.deepEqual(await fetchNews(5, 10), items);
});

test('news rejects demo homepages, unsafe links and invalid publication dates', async () => {
  const article = { id: 1, title: 'Article', url: 'https://example.com/news/1', publishedAt: '2026-10-01T00:00:00Z' };
  globalThis.fetch = async () => Response.json({ success: true, data: [
    article, null, { ...article, url: 'https://example.com/' },
    { ...article, url: 'javascript:alert(1)' }, { ...article, publishedAt: 'invalid' },
  ] });
  assert.deepEqual(await fetchNews(), [article]);
});

test('simultaneous requests share work and a later refresh fetches again', async () => {
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ success: true });
  };
  await Promise.all([requestJson('/dedupe'), requestJson('/dedupe')]);
  assert.equal(calls, 1);
  await requestJson('/dedupe');
  assert.equal(calls, 2);
});

test('stalled requests abort, leave the pending map, and allow retry', async () => {
  globalThis.fetch = (_url, init) => new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  await assert.rejects(requestJson('/timeout', 10), { name: 'AbortError' });
  globalThis.fetch = async () => Response.json({ recovered: true });
  assert.deepEqual(await requestJson('/timeout'), { recovered: true });
});
