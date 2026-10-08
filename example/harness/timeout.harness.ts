import {
  afterEach,
  describe,
  expect,
  it,
  waitUntil,
} from 'react-native-harness';
import { HTTP, poll, stopAllTracked, uid } from './utils';

const TIMED_OUT = /time(d)? ?out/i;

// Runs last (see sequencer.cjs): hanging requests keep pool threads busy.
describe('request timeout', () => {
  afterEach(stopAllTracked);

  it('custom timeout fails a hanging request', async () => {
    const started = Date.now();
    const t = poll(`${HTTP}/hang/${uid('hang-custom')}`, { timeout: 1500 });

    await waitUntil(() => t.errors.length >= 1, 10000);
    const elapsed = Date.now() - started;

    expect(t.errors[0]!.status_code).toBe(0);
    expect(t.errors[0]!.error).toMatch(TIMED_OUT);
    // First tick at 200ms + 1500ms timeout.
    expect(elapsed).toBeGreaterThan(1500);
    expect(elapsed).toBeLessThan(5000);
  });

  it('response within the timeout is delivered', async () => {
    const key = uid('within');
    const t = poll(`${HTTP}/delay/${key}?ms=800`, { timeout: 3000 });

    await waitUntil(() => t.data.length >= 1, 8000);

    expect(t.data[0]!.body).toEqual({ key, delayed: 800 });
    expect(t.errors).toEqual([]);
  });

  it('timeout covers the whole response, not idle gaps', async () => {
    // Chunks arrive every 300ms, so only an overall deadline can stop it.
    const t = poll(`${HTTP}/trickle/${uid('trickle-slow')}?ms=4000`, {
      timeout: 1500,
    });

    await waitUntil(() => t.errors.length >= 1, 10000);

    expect(t.errors[0]!.status_code).toBe(0);
    expect(t.errors[0]!.error).toMatch(TIMED_OUT);
    expect(t.data).toEqual([]);
  });

  it('slow streamed response within the timeout succeeds', async () => {
    const key = uid('trickle-ok');
    const t = poll(`${HTTP}/trickle/${key}?ms=1200`, { timeout: 5000 });

    await waitUntil(() => t.data.length >= 1, 10000);

    expect(t.data[0]!.body.key).toBe(key);
    expect(t.errors).toEqual([]);
  });

  it('default timeout fails a hanging request after ~30s', async () => {
    const started = Date.now();
    const t = poll(`${HTTP}/hang/${uid('hang-default')}`);

    await waitUntil(() => t.errors.length >= 1, 50000);
    const elapsed = Date.now() - started;

    expect(t.errors[0]!.status_code).toBe(0);
    expect(t.errors[0]!.error).toMatch(TIMED_OUT);
    expect(elapsed).toBeGreaterThan(25000);
    expect(elapsed).toBeLessThan(45000);
  });
});
