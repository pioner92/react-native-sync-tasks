# 🚀 react-native-sync-tasks

<p align="center">
<img src="./assets/img.png" width="700"/>
</p>

**react-native-sync-tasks** is a JSI library for React Native that runs **periodic HTTP polling on native threads**. You describe tasks in JavaScript; requests, scheduling and response deduplication happen in C++ and the platform HTTP stack, so the JS thread stays free.

> ⚠️ **Note**: This is not a background task manager — tasks do not continue running when the app is in the background or killed. Polling happens while the app is active, on native threads, outside the JS thread.

---

## ⚙️ Features

- 🔁 Periodic HTTP polling with a configurable interval
- 🧵 Requests run on a native thread pool — the JS thread is never blocked
- 🌐 Platform HTTP stacks: `NSURLSession` on iOS, OkHttp on Android — no bundled networking or TLS code
- 🔒 TLS through the system trust store (Android Network Security Config and iOS ATS apply as usual)
- ✨ Response deduplication — `onData` is skipped when the body has not changed
- 🛡️ A slow endpoint never runs concurrently with itself and cannot starve other tasks
- 🧠 Centralized control: start/stop every task at once

---

## 📋 Requirements

- React Native **0.80+** (tested on 0.87.1)
- New Architecture — the only option since RN 0.82. A legacy-architecture code path for RN 0.80–0.81 is included but has not been tested yet.
- iOS and Android (`minSdkVersion` 24)

---

## 📦 Installation

```bash
npm install react-native-sync-tasks
# or
yarn add react-native-sync-tasks
```

iOS: run `pod install` in your `ios` folder.

---

## 🛠️ Usage

```ts
import { createTask, SyncTasksManager } from 'react-native-sync-tasks';

type TData = {
  userId: number;
  id: number;
  title: string;
  body: string;
};

const task = createTask<TData>({
  config: {
    url: 'https://jsonplaceholder.typicode.com/posts/1',
    // optional, default 1000ms
    interval: 2000,
    // optional, whole-request timeout, default 30000ms
    timeout: 10000,
    // optional
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  },
  // { body: TData, status_code: number }
  onData: (data) => {
    console.log('DATA', data);
  },
  // { error: string, status_code: number }
  onError: (error) => {
    console.log('ERROR', error);
  },
});

SyncTasksManager.addTask(task);
SyncTasksManager.startAll();
...
// stop all tasks
SyncTasksManager.stopAll();
// or stop only 1 task
task.stop();
```

---

## 🔍 API

### `createTask<T>(props: CreateTaskParams<T>): Task`

Creates a task that periodically fetches data from the given URL on a native thread.

| Name      | Type                                                                   | Description                                 |
|-----------|------------------------------------------------------------------------|---------------------------------------------|
| `config`  | `{ url: string; interval?: number; timeout?: number; headers?: Record<string, string> }` | Polling configuration, see below |
| `onData`  | `(data: { body: T, status_code: number }) => void`                     | Called with the parsed JSON body            |
| `onError` | `(error: { error: string, status_code: number }) => void`              | Called when a request fails (optional)      |

`config` fields:

| Field      | Default | Description |
|------------|---------|-------------|
| `url`      | —       | Endpoint to poll (GET). Also the task id: a second task with the same URL is ignored by the manager |
| `interval` | `1000`  | Time between polls, ms |
| `timeout`  | `30000` | Limit for the whole request — connecting, waiting and reading the body — ms. Must be a positive number |
| `headers`  | —       | Request headers |

### `Task`

- `start(): void` — start (or resume) the task; it must be added to the manager first
- `stop(): void` — stop the task
- `isRunning(): boolean` — whether the task is currently running

### `SyncTasksManager`

- `addTask(task: Task): void` — add a single task
- `addTasks(tasks: Task[]): void` — add multiple tasks
- `startAll(): void` — start all registered tasks
- `stopAll(): void` — stop all tasks

---

## 📡 Request behavior

| Situation | Callback |
|-----------|----------|
| 2xx/3xx with a JSON body | `onData({ body, status_code })` — skipped if the body equals the previous one |
| 2xx/3xx with an empty body (e.g. `204`) | `onData({ body: null, status_code })` |
| 2xx/3xx with a non-JSON body | `onError({ error: <raw body>, status_code })` — reported once while the body stays the same |
| 4xx/5xx | `onError({ error: <raw body>, status_code })` — on every poll |
| Network/TLS error, invalid URL | `onError({ error: 'Request error: …', status_code: 0 })` |
| Request exceeded `timeout` | `onError({ error: 'Request error: …timed out…', status_code: 0 })` |

- Redirects are followed, `gzip` responses are decoded.
- Every poll hits the network: no HTTP cache, no cookies are stored or sent.
- While a task's request is in flight, its next ticks are skipped — requests of one task never overlap.
- Error messages after `Request error:` come from the platform (`NSURLSession` / OkHttp) and differ between iOS and Android.

### Plain `http://` URLs

Requests follow the platform security policies. To poll a plain `http://` endpoint, allow it the same way as for `fetch`:

- **iOS** — add an App Transport Security exception (`NSAppTransportSecurity` in `Info.plist`).
- **Android** — allow cleartext traffic for the domain via [Network Security Config](https://developer.android.com/privacy-and-security/security-config) (or `android:usesCleartextTraffic`).

---

## 🧪 Testing

Unit tests for the JS layer:

```bash
yarn test
```

Native behavior is covered by [react-native-harness](https://github.com/callstackincubator/react-native-harness) tests in `example/harness` (59 tests: responses, HTTP and transport errors, TLS verification, task lifecycle, threading, timeouts). They run inside the example app against a local mock server and show live progress on the device screen.

```bash
cd example
yarn harness:ios       # iOS simulator
yarn harness:android   # Android emulator
```

Other runners (physical devices) are listed in `example/rn-harness.config.mjs`. The CI workflow has Harness jobs for an Android emulator and an iOS simulator. The `external-tls` tests need internet access.

---

## 📄 License

MIT

---

🎉 **Enjoy using react-native-sync-tasks!** Offload polling to native threads and keep your JS thread free.
