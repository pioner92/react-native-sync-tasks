import { NativeModules } from 'react-native';

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
    interval: number; // default 1000 ms
    headers?: Record<string, string>;
  };
  onData: (data: { body: T; status_code: number }) => void;
  onError?: (error: { error: string; status_code: number }) => void;
};

declare global {
  var createTask: <T>(props: TCreateTaskProps<T>) => Task;

  var SyncTasksManager: ITaskManager;
}

// Ссылка на глобальный объект SqlDb
let __SyncTasksManager = global.SyncTasksManager;

// Автоинициализация
if (!__SyncTasksManager) {
  if (NativeModules.SyncTasksManager?.install) {
    NativeModules.SyncTasksManager.install(); // Вызываем native install метод
    __SyncTasksManager = global.SyncTasksManager; // Сохраняем глобальную ссылку на объект SqlDb
    console.log('✅ TaskManager initialized successfully');
  }
}

// Класс SqlDb для работы с базой данных
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
  const params = {
    ...props,
    interval: props.config.interval ?? 1000,
  };

  return global.createTask<T>(params);
};
