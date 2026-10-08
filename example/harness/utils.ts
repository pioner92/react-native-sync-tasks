import { NativeModules, Platform } from 'react-native';
import { createTask, SyncTasksManager } from 'react-native-sync-tasks';

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

export type DataEvent = { body: any; status_code: number };
export type ErrorEvent = { error: string; status_code: number };

export type Tracked = {
  url: string;
  task: ReturnType<typeof createTask>;
  data: DataEvent[];
  errors: ErrorEvent[];
};

let seq = 0;
// Task ids are URLs, so every test needs its own paths.
export const uid = (name: string) =>
  `${name}-${Platform.OS}-${Date.now()}-${++seq}`;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const live: Tracked[] = [];

export function track(
  url: string,
  options: {
    interval?: number;
    timeout?: number;
    headers?: Record<string, string>;
    withOnError?: boolean;
  } = {}
): Tracked {
  const data: DataEvent[] = [];
  const errors: ErrorEvent[] = [];
  const task = createTask<any>({
    config: {
      url,
      interval: options.interval ?? 200,
      timeout: options.timeout,
      headers: options.headers,
    },
    onData: (d: DataEvent) => data.push(d),
    onError:
      options.withOnError === false
        ? undefined
        : (e: ErrorEvent) => errors.push(e),
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

export function poll(url: string, options?: Parameters<typeof track>[1]) {
  const tracked = track(url, options);
  startManagerOnce();
  SyncTasksManager.addTask(tracked.task);
  tracked.task.start();
  return tracked;
}

export function stopAllTracked() {
  while (live.length) {
    live.pop()!.task.stop();
  }
}

export async function serverStats(
  path: string
): Promise<{ hits: number; headers: Record<string, string> | null }> {
  const res = await fetch(`${HTTP}/__hits/${path}`);
  return res.json();
}
