import { describe, expect, it, waitUntil } from 'react-native-harness';
import { SyncTasksManager } from 'react-native-sync-tasks';
import { HTTP, serverStats, sleep, stopAllTracked, track, uid } from './utils';

// startAll() restarts every registered task, so this file keeps its own runtime.
describe('SyncTasksManager', () => {
  it('addTasks / startAll / stopAll / resume', async () => {
    const keys = [uid('m1'), uid('m2'), uid('m3')];
    const tasks = keys.map((k) => track(`${HTTP}/counter/${k}`));

    SyncTasksManager.addTasks(tasks.map((t) => t.task));
    SyncTasksManager.startAll();

    await waitUntil(() => tasks.every((t) => t.data.length >= 2), 5000);
    expect(tasks.every((t) => t.task.isRunning())).toBe(true);

    SyncTasksManager.stopAll();
    expect(tasks.some((t) => t.task.isRunning())).toBe(false);
    await sleep(600);
    const frozen = await Promise.all(
      keys.map(async (k) => (await serverStats(`counter/${k}`)).hits)
    );
    await sleep(1500);
    const later = await Promise.all(
      keys.map(async (k) => (await serverStats(`counter/${k}`)).hits)
    );
    expect(later).toEqual(frozen);

    SyncTasksManager.startAll();
    await waitUntil(async () => {
      const now = await Promise.all(
        keys.map(async (k) => (await serverStats(`counter/${k}`)).hits)
      );
      return now.every((h, i) => h >= frozen[i]! + 2);
    }, 5000);

    stopAllTracked();
  });
});
