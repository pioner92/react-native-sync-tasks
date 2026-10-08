import {
  afterEach,
  describe,
  expect,
  it,
  waitUntil,
} from 'react-native-harness';
import {
  CLOSED_PORT_URL,
  HTTP,
  HTTPS,
  poll,
  serverStats,
  stopAllTracked,
  TLS_ERROR,
  uid,
} from './utils';

describe('HTTP error responses', () => {
  afterEach(stopAllTracked);

  for (const code of [400, 401, 403, 404, 500, 503]) {
    it(`HTTP ${code} → onError with body`, async () => {
      const t = poll(`${HTTP}/status/${code}?k=${uid('status')}`);

      await waitUntil(() => t.errors.length >= 1, 5000);

      expect(t.errors[0]!.status_code).toBe(code);
      expect(JSON.parse(t.errors[0]!.error)).toEqual({
        code,
        message: `status ${code}`,
      });
      expect(t.data).toEqual([]);
    });
  }

  it('non-JSON error body as string', async () => {
    const t = poll(`${HTTP}/status-text/500?k=${uid('text-error')}`);

    await waitUntil(() => t.errors.length >= 1, 5000);

    expect(t.errors[0]).toMatchObject({
      error: 'plain error 500',
      status_code: 500,
    });
  });

  it('reports every failed poll', async () => {
    const t = poll(`${HTTP}/status/500?k=${uid('repeat')}`);

    await waitUntil(() => t.errors.length >= 3, 5000);

    expect(t.errors.every((e) => e.status_code === 500)).toBe(true);
  });

  it('no crash without onError', async () => {
    const failing = poll(`${HTTP}/status/500?k=${uid('no-handler')}`, {
      withOnError: false,
    });
    const key = uid('after-no-handler');
    const ok = poll(`${HTTP}/counter/${key}`);

    await waitUntil(() => ok.data.length >= 2, 5000);

    expect(failing.data).toEqual([]);
    expect(ok.data[0]!.body.key).toBe(key);
  });
});

describe('transport failures', () => {
  afterEach(stopAllTracked);

  it('connection refused → status 0', async () => {
    const t = poll(CLOSED_PORT_URL);

    await waitUntil(() => t.errors.length >= 1, 10000);

    expect(t.errors[0]!.status_code).toBe(0);
    expect(t.errors[0]!.error).toMatch(/^Request error: /);
  });

  it('dropped connection → status 0', async () => {
    const t = poll(`${HTTP}/drop/${uid('drop')}`);

    await waitUntil(() => t.errors.length >= 1, 10000);

    expect(t.errors[0]!.status_code).toBe(0);
    expect(t.data).toEqual([]);
  });

  it('unknown host → status 0', async () => {
    const t = poll(`https://${uid('nohost')}.invalid/`);

    await waitUntil(() => t.errors.length >= 1, 15000);

    expect(t.errors[0]!.status_code).toBe(0);
    expect(t.errors[0]!.error).not.toMatch(TLS_ERROR);
  });

  for (const url of ['not a url', 'gopher://localhost/x', '']) {
    it(`invalid URL ${JSON.stringify(url)} → status 0`, async () => {
      const t = poll(url);

      await waitUntil(() => t.errors.length >= 1, 5000);

      expect(t.errors[0]!.status_code).toBe(0);
      expect(t.errors[0]!.error).toMatch(/^Request error: /);
    });
  }
});

describe('TLS verification', () => {
  afterEach(stopAllTracked);

  it('self-signed cert rejected, no request', async () => {
    const key = uid('self-signed');
    const t = poll(`${HTTPS}/counter/${key}`);

    await waitUntil(() => t.errors.length >= 1, 10000);

    expect(t.errors[0]!.status_code).toBe(0);
    expect(t.errors[0]!.error).toMatch(TLS_ERROR);
    expect(t.data).toEqual([]);
    expect((await serverStats(`counter/${key}`)).hits).toBe(0);
  });
});
