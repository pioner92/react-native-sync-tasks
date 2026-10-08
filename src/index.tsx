import NativeSyncTasks from './NativeSyncTasks';

const DEFAULT_TIMEOUT_MS = 30000;

type Task = {
  stop: () => void;
  start: () => void;
  isRunning: () => boolean;
};

interface ITaskManager {
  addTask(task: Task): void;
  addTasks(tasks: Task[]): void;
  startAll(): void;
  stopAll(): void;
}

type TCreateTaskProps<T> = {
  config: {
    url: string;
    interval?: number; // default 1000 ms
    timeout?: number; // whole request, default 30000 ms
    headers?: Record<string, string>;
  };
  onData: (data: { body: T; status_code: number }) => void;
  onError?: (error: { error: string; status_code: number }) => void;
};

declare global {
  var createTask: <T>(props: TCreateTaskProps<T>) => Task;

  var SyncTasksManager: ITaskManager;
}

// Importing NativeSyncTasks creates the module, which installs the bindings on the new architecture.
if (!global.SyncTasksManager) {
  NativeSyncTasks?.install();
}

// Global object installed by the native module
const __SyncTasksManager = global.SyncTasksManager;

// Thin typed wrapper over the global SyncTasksManager
export class SyncTasksManager {
  static instance: ITaskManager | null = __SyncTasksManager;

  static addTask(task: Task) {
    if (!this.instance) {
      throw new Error('TaskManager not initialized');
    }
    this.instance.addTask(task);
  }

  static addTasks(tasks: Task[]) {
    if (!this.instance) {
      throw new Error('TaskManager not initialized');
    }
    this.instance.addTasks(tasks);
  }

  static startAll() {
    if (!this.instance) {
      throw new Error('TaskManager not initialized');
    }
    this.instance.startAll();
  }

  static stopAll() {
    if (!this.instance) {
      throw new Error('TaskManager not initialized');
    }
    this.instance.stopAll();
  }
}

export const createTask = <T extends unknown>(
  props: TCreateTaskProps<T>
): Task => {
  const timeout = props.config.timeout ?? DEFAULT_TIMEOUT_MS;

  if (!(timeout > 0) || !Number.isFinite(timeout)) {
    throw new Error(
      '[SyncTasksManager]: timeout must be a positive number of ms'
    );
  }

  const params = {
    ...props,
    config: {
      ...props.config,
      interval: props.config.interval ?? 1000,
      timeout,
    },
  };

  return global.createTask<T>(params);
};
