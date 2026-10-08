import { NativeModules, Platform } from 'react-native';
import {
  createTask,
  SyncTasksManager,
  type Task,
  type TaskConfig,
  type TaskData,
  type TaskError,
} from 'react-native-sync-tasks';

// The mock server runs next to Metro, so reuse the host the bundle was loaded from:
// localhost on simulators and on Android (`adb reverse`), the Mac's LAN IP on a physical iPhone.
const scriptURL: string | undefined =
  NativeModules.SourceCode?.getConstants?.().scriptURL;
const HOST = scriptURL?.match(/^https?:\/\/([^:/]+)/)?.[1] ?? 'localhost';

export const HTTP = `http://${HOST}:8099`;
export const HTTPS = `https://${HOST}:8100`;
export const CLOSED_PORT_URL = `http://${HOST}:8101/`;

export const TLS_ERROR =
  /TLS|SSL|certificat|trust anchor|not verified|handshake/i;

export type DataEvent = TaskData<any>;
export type ErrorEvent = TaskError;

export type Tracked = {
  url: string;
  task: Task;
  data: DataEvent[];
  errors: ErrorEvent[];
};

export type TrackOptions = Omit<TaskConfig, 'url'> & { withOnError?: boolean };

let seq = 0;
// Unique paths keep the mock server's per-path counters independent between tests.
export const uid = (name: string) =>
  `${name}-${Platform.OS}-${Date.now()}-${++seq}`;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const live: Tracked[] = [];

export function track(url: string, options: TrackOptions = {}): Tracked {
  const { withOnError, ...config } = options;
  const data: DataEvent[] = [];
  const errors: ErrorEvent[] = [];
  const task = createTask<any>({
    config: { url, ...config, interval: config.interval ?? 200 },
    onData: (d) => data.push(d),
    onError: withOnError === false ? undefined : (e) => errors.push(e),
  });
  const tracked = { url, task, data, errors };
  live.push(tracked);
  return tracked;
}

// Each test file is a separate bundle, so the flag lives on the shared global object.
export function startManagerOnce() {
  const g = globalThis as { __syncTasksManagerStarted?: boolean };
  if (!g.__syncTasksManagerStarted) {
    SyncTasksManager.startAll();
    g.__syncTasksManagerStarted = true;
  }
}

export function poll(url: string, options?: TrackOptions) {
  const tracked = track(url, options);
  startManagerOnce();
  SyncTasksManager.addTask(tracked.task);
  tracked.task.start();
  return tracked;
}

// Removes every task created by the test, aborting in-flight requests.
export function stopAllTracked() {
  while (live.length) {
    SyncTasksManager.removeTask(live.pop()!.task);
  }
}

export type ServerStats = {
  hits: number;
  headers: Record<string, string> | null;
  times: number[];
  aborted: number;
  notModified: number;
};

export async function serverStats(path: string): Promise<ServerStats> {
  const res = await fetch(`${HTTP}/__hits/${path}`);
  return res.json();
}

export async function bumpVersion(key: string) {
  await fetch(`${HTTP}/__bump/${key}`);
}

export async function maxConcurrency(group: string): Promise<number> {
  const res = await fetch(`${HTTP}/__concurrency/${group}`);
  return (await res.json()).max;
}
