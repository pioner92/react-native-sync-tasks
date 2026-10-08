import {
  afterEach,
  describe,
  expect,
  it,
  waitUntil,
} from 'react-native-harness';
import { HTTP, poll, serverStats, sleep, stopAllTracked, uid } from './utils';

describe('successful responses', () => {
  afterEach(stopAllTracked);

  it('JSON body + status 200', async () => {
    const key = uid('json');
    const t = poll(`${HTTP}/counter/${key}`);

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]!.status_code).toBe(200);
    expect(t.data[0]!.body).toEqual({ key, n: 1 });
    expect(t.errors).toEqual([]);
  });

  it('delivers changed bodies in order', async () => {
    const t = poll(`${HTTP}/counter/${uid('changing')}`);

    await waitUntil(() => t.data.length >= 4, 5000);

    const ns = t.data.map((d) => d.body.n);
    expect(ns.slice(0, 4)).toEqual([1, 2, 3, 4]);
  });

  it('skips unchanged body, no HTTP cache', async () => {
    const key = uid('static');
    // The server answers with Cache-Control: max-age=3600.
    const t = poll(`${HTTP}/static/${key}`);

    await waitUntil(
      async () => (await serverStats(`static/${key}`)).hits >= 5,
      5000
    );

    expect(t.data).toHaveLength(1);
    expect(t.data[0]!.body).toEqual({ key, value: 'same' });
  });

  it('sends custom headers', async () => {
    const t = poll(`${HTTP}/echo/${uid('headers')}`, {
      headers: {
        'X-Sync-Test': 'abc-123',
        'X-Second': 'two',
        'Accept': 'application/json',
      },
    });

    await waitUntil(() => t.data.length >= 1, 5000);

    const headers = t.data[0]!.body.headers;
    expect(headers['x-sync-test']).toBe('abc-123');
    expect(headers['x-second']).toBe('two');
    expect(headers.accept).toBe('application/json');
  });

  it('custom User-Agent overrides default', async () => {
    const t = poll(`${HTTP}/echo/${uid('ua')}`, {
      headers: { 'User-Agent': 'SyncTasksTest/1.0' },
    });

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]!.body.headers['user-agent']).toBe('SyncTasksTest/1.0');
  });

  it('query string intact', async () => {
    const t = poll(`${HTTP}/echo/${uid('query')}?x=1&y=a%20b&z=%D1%8F`);

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]!.body.query).toEqual({
      x: '1',
      y: 'a b',
      z: 'я'.normalize(),
    });
  });

  it('decodes gzip', async () => {
    const key = uid('gzip');
    const t = poll(`${HTTP}/gzip/${key}`);

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]!.body).toEqual({ key, gzipped: true });
  });

  it('multi-byte UTF-8', async () => {
    const t = poll(`${HTTP}/utf8/${uid('utf8')}`);

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]!.body.text).toBe('héllo 👋 日本 ü — ✓');
  });

  it('follows 3 redirects', async () => {
    const key = uid('redirect');
    const t = poll(`${HTTP}/redirect/${key}?left=3`);

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]!.status_code).toBe(200);
    expect(t.data[0]!.body.key).toBe(`${key}-final`);
  });

  it('~1.5 MB JSON payload', async () => {
    const t = poll(`${HTTP}/large/${uid('large')}?count=20000`, {
      interval: 1000,
    });

    await waitUntil(() => t.data.length >= 1, 15000);

    const body = t.data[0]!.body;
    expect(body).toHaveLength(20000);
    expect(body[19999]).toEqual({ i: 19999, title: 'item 19999' });
  });

  it('no cookies stored or sent', async () => {
    const cookieKey = uid('cookie');
    const setter = poll(`${HTTP}/set-cookie/${cookieKey}`);
    await waitUntil(() => setter.data.length >= 1, 5000);
    await sleep(500);

    const echoKey = uid('cookie-echo');
    const echo = poll(`${HTTP}/echo/${echoKey}`);
    await waitUntil(() => echo.data.length >= 1, 5000);

    expect(echo.data[0]!.body.headers.cookie).toBeUndefined();
    expect(
      (await serverStats(`set-cookie/${cookieKey}`)).headers?.cookie
    ).toBeUndefined();
  });
});
