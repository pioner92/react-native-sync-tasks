import {
  afterEach,
  describe,
  expect,
  it,
  waitUntil,
} from 'react-native-harness';
import { poll, stopAllTracked, TLS_ERROR, uid } from './utils';

// Needs internet: checks real-world certificate chains against the platform trust store.
// 404 pages are used on purpose: the error path does not parse JSON, any HTTP status proves the handshake passed.
describe('TLS against public hosts (network)', () => {
  afterEach(stopAllTracked);

  for (const host of [
    'jsonplaceholder.typicode.com',
    'valid-isrgrootx1.letsencrypt.org',
    'github.com',
  ]) {
    it(`valid cert: ${host}`, async () => {
      const t = poll(`https://${host}/synctasks-${uid('nf')}`, {
        interval: 500,
      });

      await waitUntil(() => t.errors.length + t.data.length >= 1, 20000);

      const status = t.errors[0]?.status_code ?? t.data[0]!.status_code;
      expect(status).toBeGreaterThan(0);
    });
  }

  // revoked.badssl.com is left out: neither platform stack checks revocation by default.
  for (const host of [
    'expired',
    'wrong.host',
    'self-signed',
    'untrusted-root',
  ]) {
    it(`rejects ${host}.badssl.com`, async () => {
      const t = poll(`https://${host}.badssl.com/?k=${uid('bad')}`, {
        interval: 500,
      });

      await waitUntil(() => t.errors.length >= 1, 20000);

      expect(t.errors[0]!.status_code).toBe(0);
      expect(t.errors[0]!.error).toMatch(TLS_ERROR);
      expect(t.data).toEqual([]);
    });
  }
});
