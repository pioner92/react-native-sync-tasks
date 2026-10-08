import {
  afterEach,
  describe,
  expect,
  it,
  waitUntil,
} from 'react-native-harness';
import { SyncTasksManager } from 'react-native-sync-tasks';
import {
  bumpVersion,
  HTTP,
  maxConcurrency,
  poll,
  serverStats,
  sleep,
  stopAllTracked,
  uid,
} from './utils';

const gaps = (times: number[]) => times.slice(1).map((t, i) => t - times[i]!);

describe('request method and body', () => {
  afterEach(stopAllTracked);

  it('POST sends the body and headers', async () => {
    const t = poll(`${HTTP}/echo/${uid('post')}`, {
      method: 'POST',
      body: '{"hello":"world"}',
      headers: { 'Content-Type': 'application/json' },
    });

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]!.body.method).toBe('POST');
    expect(t.data[0]!.body.body).toBe('{"hello":"world"}');
    expect(t.data[0]!.body.headers['content-type']).toBe('application/json');
  });

  for (const method of ['PUT', 'PATCH', 'DELETE'] as const) {
    it(`${method} is sent as ${method}`, async () => {
      const t = poll(`${HTTP}/echo/${uid(method)}`, { method, body: 'x' });

      await waitUntil(() => t.data.length >= 1, 5000);

      expect(t.data[0]!.body.method).toBe(method);
      expect(t.data[0]!.body.body).toBe('x');
    });
  }

  it('POST without a body sends an empty body', async () => {
    const t = poll(`${HTTP}/echo/${uid('post-empty')}`, { method: 'POST' });

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]!.body.method).toBe('POST');
    expect(t.data[0]!.body.body).toBe('');
  });
});

describe('response headers', () => {
  afterEach(stopAllTracked);

  it('onData receives lowercased response headers', async () => {
    const key = uid('headers');
    const t = poll(`${HTTP}/echo/${key}`);

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]!.headers['x-echo-key']).toBe(key);
    expect(t.data[0]!.headers['content-type']).toBe('application/json');
  });

  it('onError receives response headers of an HTTP error', async () => {
    const t = poll(`${HTTP}/status/404?k=${uid('err-headers')}`);

    await waitUntil(() => t.errors.length >= 1, 5000);

    expect(t.errors[0]!.headers['x-status-route']).toBe('404');
  });
});

describe('conditional requests (ETag)', () => {
  afterEach(stopAllTracked);

  it('sends If-None-Match and skips 304 responses', async () => {
    const key = uid('etag');
    const t = poll(`${HTTP}/etag/${key}`);

    await waitUntil(
      async () => (await serverStats(`etag/${key}`)).notModified >= 3,
      5000
    );
    const stats = await serverStats(`etag/${key}`);

    expect(t.data).toHaveLength(1);
    expect(t.data[0]!.body).toEqual({ key, version: 1 });
    expect(stats.headers?.['if-none-match']).toBe('"v1"');
  });

  it('delivers the new body after the resource changes', async () => {
    const key = uid('etag-change');
    const t = poll(`${HTTP}/etag/${key}`);
    await waitUntil(() => t.data.length >= 1, 5000);

    await bumpVersion(key);

    await waitUntil(() => t.data.length >= 2, 5000);
    expect(t.data[1]!.body).toEqual({ key, version: 2 });
  });

  it('conditional: false sends no validators', async () => {
    const key = uid('etag-off');
    const t = poll(`${HTTP}/etag/${key}`, { conditional: false });

    await waitUntil(
      async () => (await serverStats(`etag/${key}`)).hits >= 3,
      5000
    );
    const stats = await serverStats(`etag/${key}`);

    expect(stats.notModified).toBe(0);
    expect(stats.headers?.['if-none-match']).toBeUndefined();
    expect(t.data).toHaveLength(1);
  });
});

describe('backoff and jitter', () => {
  afterEach(stopAllTracked);

  it('backoff slows down polling of a failing endpoint', async () => {
    const plainKey = uid('no-backoff');
    const backoffKey = uid('backoff');
    poll(`${HTTP}/flaky/${plainKey}?fails=1000`);
    poll(`${HTTP}/flaky/${backoffKey}?fails=1000`, {
      backoff: { multiplier: 2, maxInterval: 1600 },
    });

    await sleep(3500);
    const plain = (await serverStats(`flaky/${plainKey}`)).hits;
    const backedOff = (await serverStats(`flaky/${backoffKey}`)).hits;

    // Without backoff ~17 requests in 3.5s; with it the waits are 400, 800, 1600, 1600ms.
    expect(plain).toBeGreaterThanOrEqual(10);
    expect(backedOff).toBeLessThanOrEqual(6);
  });

  it('backoff resets after a success', async () => {
    const key = uid('flaky');
    const t = poll(`${HTTP}/flaky/${key}?fails=3`, {
      backoff: { multiplier: 2, maxInterval: 5000 },
    });

    await waitUntil(() => t.data.length >= 1, 8000);
    await sleep(1200);
    const { times } = await serverStats(`flaky/${key}`);
    const g = gaps(times);

    // Failures: 200 → 400 → 800 → 1600ms waits; after the success it is back to ~200ms.
    expect(g[2]).toBeGreaterThan(1200);
    expect(Math.max(...g.slice(-3))).toBeLessThan(700);
    expect(t.errors).toHaveLength(3);
  });

  it('jitter spreads the delays', async () => {
    const steadyKey = uid('steady');
    const jitterKey = uid('jitter');
    poll(`${HTTP}/counter/${steadyKey}`, { interval: 300 });
    poll(`${HTTP}/counter/${jitterKey}`, { interval: 300, jitter: 0.5 });

    await sleep(4000);
    const spread = async (key: string) => {
      const g = gaps((await serverStats(`counter/${key}`)).times);
      return Math.max(...g) - Math.min(...g);
    };

    // jitter 0.5 → each wait is 150..450ms.
    expect(await spread(jitterKey)).toBeGreaterThan(120);
    expect(await spread(jitterKey)).toBeGreaterThan(await spread(steadyKey));
  });
});

describe('max concurrent requests', () => {
  afterEach(() => {
    stopAllTracked();
    SyncTasksManager.setMaxConcurrentRequests(4);
  });

  it('limit 1 runs requests one at a time', async () => {
    const group = uid('g1');
    SyncTasksManager.setMaxConcurrentRequests(1);
    const tasks = [0, 1, 2].map((i) =>
      poll(`${HTTP}/delay/${uid(`c1-${i}`)}?ms=500&group=${group}`, {
        interval: 100,
      })
    );

    await waitUntil(() => tasks.every((t) => t.data.length >= 1), 10000);

    expect(await maxConcurrency(group)).toBe(1);
  });

  it('raising the limit lets requests run in parallel', async () => {
    const group = uid('g3');
    SyncTasksManager.setMaxConcurrentRequests(3);
    const tasks = [0, 1, 2].map((i) =>
      poll(`${HTTP}/delay/${uid(`c3-${i}`)}?ms=800&group=${group}`, {
        interval: 100,
      })
    );

    await waitUntil(() => tasks.every((t) => t.data.length >= 1), 10000);

    expect(await maxConcurrency(group)).toBe(3);
  });
});
