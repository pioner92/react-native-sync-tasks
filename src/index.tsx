import NativeSyncTasks from './NativeSyncTasks';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type TaskConfig = {
  url: string;
  /** Time between polls, ms. Default 1000. */
  interval?: number;
  /** Limit for the whole request, ms. Default 30000. */
  timeout?: number;
  /** Default GET. */
  method?: HttpMethod;
  /** Raw request body; not allowed with GET. */
  body?: string;
  headers?: Record<string, string>;
  /** Run the first request right after the task is added. Default false. */
  immediate?: boolean;
  /** Random spread of each delay as a fraction of it (0..1). Default 0. */
  jitter?: number;
  /** Grow the delay after consecutive failures; reset on success. */
  backoff?: {
    /** Default 2. */
    multiplier?: number;
    /** Upper bound for the delay, ms. Default max(interval, 60000). */
    maxInterval?: number;
  };
  /** Send If-None-Match / If-Modified-Since on GET and skip 304 responses. Default true. */
  conditional?: boolean;
};

export type TaskData<T> = {
  body: T;
  status_code: number;
  headers: Record<string, string>;
};

export type TaskError = {
  error: string;
  status_code: number;
  headers: Record<string, string>;
};

export type CreateTaskParams<T> = {
  config: TaskConfig;
  onData: (data: TaskData<T>) => void;
  onError?: (error: TaskError) => void;
};

export type Task = {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
};

type NativeTaskManager = {
  addTask(task: Task): void;
  addTasks(tasks: Task[]): void;
  removeTask(task: Task): void;
  startAll(): void;
  stopAll(): void;
  setMaxConcurrentRequests(count: number): void;
};

// Bindings installed by the native module; kept off the global TypeScript scope.
type NativeGlobals = {
  SyncTasksManager?: NativeTaskManager;
  createTask?: <T>(params: CreateTaskParams<T>) => Task;
};

const nativeGlobals = globalThis as unknown as NativeGlobals;

const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 30000;
const MAX_MS = 2147483647;
const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const NOT_INSTALLED =
  'native module is not installed. Rebuild the app after installing react-native-sync-tasks.';

// Importing NativeSyncTasks creates the module, which installs the bindings on the new architecture.
if (!nativeGlobals.SyncTasksManager) {
  NativeSyncTasks?.install();
}

const fail = (message: string): never => {
  throw new Error(`[SyncTasksManager]: ${message}`);
};

const checkMs = (name: string, value: number | undefined, min = 1) => {
  if (
    value !== undefined &&
    (typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > MAX_MS)
  ) {
    fail(`${name} must be a number of ms between ${min} and ${MAX_MS}`);
  }
};

const validateConfig = (config: TaskConfig) => {
  if (typeof config?.url !== 'string') {
    fail('config.url must be a string');
  }
  checkMs('interval', config.interval);
  checkMs('timeout', config.timeout);

  if (config.method !== undefined && !METHODS.includes(config.method)) {
    fail(`method must be one of ${METHODS.join(', ')}`);
  }
  if (config.body !== undefined) {
    if (typeof config.body !== 'string') {
      fail('body must be a string');
    }
    if ((config.method ?? 'GET') === 'GET') {
      fail('body is not allowed with GET');
    }
  }
  if (
    config.jitter !== undefined &&
    !(
      typeof config.jitter === 'number' &&
      config.jitter >= 0 &&
      config.jitter <= 1
    )
  ) {
    fail('jitter must be a number between 0 and 1');
  }
  if (config.backoff !== undefined) {
    const { multiplier, maxInterval } = config.backoff;
    if (
      multiplier !== undefined &&
      !(typeof multiplier === 'number' && multiplier >= 1 && multiplier <= 100)
    ) {
      fail('backoff.multiplier must be a number between 1 and 100');
    }
    checkMs(
      'backoff.maxInterval',
      maxInterval,
      config.interval ?? DEFAULT_INTERVAL_MS
    );
  }
};

const getManager = (): NativeTaskManager =>
  nativeGlobals.SyncTasksManager ?? fail(NOT_INSTALLED);

export class SyncTasksManager {
  /** Adds a task; adding the same task twice has no effect. */
  static addTask(task: Task) {
    getManager().addTask(task);
  }

  static addTasks(tasks: Task[]) {
    getManager().addTasks(tasks);
  }

  /** Stops the task, aborts its in-flight request and forgets it. It can be added again. */
  static removeTask(task: Task) {
    getManager().removeTask(task);
  }

  /** Starts every added task, including ones stopped individually. */
  static startAll() {
    getManager().startAll();
  }

  /** Stops every task and aborts in-flight requests. */
  static stopAll() {
    getManager().stopAll();
  }

  /** Number of requests that can run at the same time (1..64). Default 4. */
  static setMaxConcurrentRequests(count: number) {
    getManager().setMaxConcurrentRequests(count);
  }
}

export const createTask = <T = unknown,>(props: CreateTaskParams<T>): Task => {
  const nativeCreateTask = nativeGlobals.createTask ?? fail(NOT_INSTALLED);

  validateConfig(props?.config);

  return nativeCreateTask<T>({
    ...props,
    config: {
      ...props.config,
      interval: props.config.interval ?? DEFAULT_INTERVAL_MS,
      timeout: props.config.timeout ?? DEFAULT_TIMEOUT_MS,
    },
  });
};
