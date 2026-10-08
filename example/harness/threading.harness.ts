import {
  afterEach,
  describe,
  expect,
  it,
  waitUntil,
} from 'react-native-harness';
import { HTTP, poll, serverStats, sleep, stopAllTracked, uid } from './utils';

// Requests run on the native thread pool; the JS thread must stay free while they are in flight.
async function measureJsLag(during: Promise<unknown>) {
  let maxLag = 0;
  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    maxLag = Math.max(maxLag, now - last - 20);
    last = now;
  }, 20);
  try {
    await during;
  } finally {
    clearInterval(timer);
  }
  return maxLag;
}

describe('threading', () => {
  afterEach(stopAllTracked);

  it('JS thread free during 4 slow requests', async () => {
    const tasks = Array.from({ length: 4 }, (_, i) =>
      poll(`${HTTP}/delay/${uid(`slow${i}`)}?ms=2000`, { interval: 300 })
    );

    const lag = await measureJsLag(
      waitUntil(() => tasks.every((t) => t.data.length >= 1), 10000)
    );

    // A blocked JS thread would lag ~2000ms (the request duration); emulators jitter by a few hundred.
    expect(lag).toBeLessThan(1000);
  });

  it('8 slow tasks on 4 threads, no deadlock', async () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      poll(`${HTTP}/delay/${uid(`queue${i}`)}?ms=1000`, { interval: 300 })
    );

    await waitUntil(() => tasks.every((t) => t.data.length >= 1), 20000);

    expect(tasks.every((t) => t.errors.length === 0)).toBe(true);
  });

  it('10 concurrent tasks, own callbacks', async () => {
    const keys = Array.from({ length: 10 }, (_, i) => uid(`c${i}`));
    const tasks = keys.map((k) => poll(`${HTTP}/static/${k}`));

    await waitUntil(() => tasks.every((t) => t.data.length >= 1), 10000);

    tasks.forEach((t, i) => {
      expect(t.data[0]!.body.key).toBe(keys[i]);
      expect(t.errors).toEqual([]);
    });
  });

  it('slow task never overlaps with itself', async () => {
    const key = uid('overlap');
    // 1.5s responses polled every 200ms: only sequential requests are allowed.
    poll(`${HTTP}/delay/${key}?ms=1500`, { interval: 200 });

    await sleep(4000);
    const { hits } = await serverStats(`delay/${key}`);

    expect(hits).toBeGreaterThanOrEqual(2);
    expect(hits).toBeLessThanOrEqual(3);
  });

  // Last in the file: the hanging request keeps one pool thread busy for ~30s after the test.
  it('hanging task does not starve other tasks', async () => {
    poll(`${HTTP}/hang/${uid('starve')}`, { interval: 100 });
    await sleep(1000);
    const others = Array.from({ length: 3 }, (_, i) =>
      poll(`${HTTP}/counter/${uid(`alive${i}`)}`)
    );

    await waitUntil(() => others.every((t) => t.data.length >= 3), 8000);
  });
});
