import {
  afterEach,
  describe,
  expect,
  it,
  waitUntil,
} from 'react-native-harness';
import { HTTP, poll, stopAllTracked, uid } from './utils';

describe('non-JSON success responses', () => {
  afterEach(stopAllTracked);

  it('empty 204 → onData with body null', async () => {
    const t = poll(`${HTTP}/empty/${uid('empty')}`);

    await waitUntil(() => t.data.length >= 1, 5000);

    expect(t.data[0]).toMatchObject({ body: null, status_code: 204 });
    expect(t.errors).toEqual([]);
  });

  it('text 200 → onError with the raw body', async () => {
    const t = poll(`${HTTP}/text/${uid('text')}`);

    await waitUntil(() => t.errors.length >= 1, 5000);

    expect(t.errors[0]).toMatchObject({ error: 'not json', status_code: 200 });
    expect(t.data).toEqual([]);
  });
});
