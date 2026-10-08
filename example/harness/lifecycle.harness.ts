import {
  afterEach,
  describe,
  expect,
  it,
  waitUntil,
} from 'react-native-harness';
import { createTask, SyncTasksManager } from 'react-native-sync-tasks';
import {
  HTTP,
  poll,
  serverStats,
  sleep,
  startManagerOnce,
  stopAllTracked,
  track,
  uid,
} from './utils';

describe('task lifecycle', () => {
  afterEach(stopAllTracked);

  it('isRunning() across create/start/stop', async () => {
    const t = track(`${HTTP}/counter/${uid('running')}`);
    expect(t.task.isRunning()).toBe(false);

    startManagerOnce();
    SyncTasksManager.addTask(t.task);
    t.task.start();
    expect(t.task.isRunning()).toBe(true);

    t.task.stop();
    expect(t.task.isRunning()).toBe(false);
  });

  it('start() ignored before addTask', async () => {
    const key = uid('not-added');
    const t = track(`${HTTP}/counter/${key}`);

    t.task.start();
    await sleep(1000);

    expect(t.task.isRunning()).toBe(false);
    expect((await serverStats(`counter/${key}`)).hits).toBe(0);
  });

  it('stop() halts requests', async () => {
    const key = uid('stop');
    const t = poll(`${HTTP}/counter/${key}`);
    await waitUntil(() => t.data.length >= 2, 5000);

    t.task.stop();
    // Let an in-flight request finish before taking the snapshot.
    await sleep(600);
    const hitsAfterStop = (await serverStats(`counter/${key}`)).hits;
    const dataAfterStop = t.data.length;
    await sleep(1500);

    expect((await serverStats(`counter/${key}`)).hits).toBe(hitsAfterStop);
    expect(t.data.length).toBe(dataAfterStop);
  });

  it('start() after stop() resumes', async () => {
    const key = uid('restart');
    const t = poll(`${HTTP}/counter/${key}`);
    await waitUntil(() => t.data.length >= 2, 5000);
    t.task.stop();
    await sleep(600);
    const before = t.data.length;

    t.task.start();

    await waitUntil(() => t.data.length >= before + 2, 5000);
    expect(t.task.isRunning()).toBe(true);
  });

  it('respects the 500ms interval', async () => {
    const key = uid('interval');
    poll(`${HTTP}/counter/${key}`, { interval: 500 });

    await sleep(2750);
    const { hits } = await serverStats(`counter/${key}`);

    // First run fires one interval after start: expect ~5 requests in 2.75s.
    expect(hits).toBeGreaterThanOrEqual(4);
    expect(hits).toBeLessThanOrEqual(6);
  });

  it('default interval is 1000ms', async () => {
    const key = uid('default-interval');
    const url = `${HTTP}/counter/${key}`;
    const data: unknown[] = [];
    const task = createTask<any>({
      config: { url },
      onData: (d) => data.push(d),
    });
    startManagerOnce();
    SyncTasksManager.addTask(task);
    task.start();

    await sleep(3400);
    task.stop();
    const { hits } = await serverStats(`counter/${key}`);

    expect(hits).toBeGreaterThanOrEqual(2);
    expect(hits).toBeLessThanOrEqual(4);
  });

  it('same URL twice: 2nd not scheduled', async () => {
    const url = `${HTTP}/counter/${uid('same-url')}`;
    const first = poll(url);
    const second = poll(url);

    await waitUntil(() => first.data.length >= 2, 5000);

    expect(second.task.isRunning()).toBe(false);
    expect(second.data).toEqual([]);
  });
});

describe('argument validation', () => {
  it('createTask: onData must be a function', () => {
    expect(() =>
      createTask({
        config: { url: `${HTTP}/counter/x`, interval: 1000 },
        onData: 123 as any,
      })
    ).toThrow(/onData must be a function/);
  });

  it('createTask: header must be a string', () => {
    expect(() =>
      createTask({
        config: {
          url: `${HTTP}/counter/x`,
          interval: 1000,
          headers: { 'X-Num': 1 as any },
        },
        onData: () => {},
      })
    ).toThrow(/Invalid Header/);
  });

  it('addTask: rejects a non-task', () => {
    expect(() => SyncTasksManager.addTask({} as any)).toThrow(
      /Invalid argument/
    );
  });

  it('addTasks: rejects a non-array', () => {
    expect(() => SyncTasksManager.addTasks({} as any)).toThrow(
      /must be an array/
    );
  });

  it('addTasks: rejects non-task items', () => {
    expect(() => SyncTasksManager.addTasks([{} as any])).toThrow(
      /Invalid argument/
    );
  });
});
