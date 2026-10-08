const mockNativeTask = {
  start: jest.fn(),
  stop: jest.fn(),
  isRunning: jest.fn(() => false),
};
const mockManager = {
  addTask: jest.fn(),
  addTasks: jest.fn(),
  removeTask: jest.fn(),
  startAll: jest.fn(),
  stopAll: jest.fn(),
  setMaxConcurrentRequests: jest.fn(),
};
const mockCreateTask = jest.fn(() => mockNativeTask);
const mockInstall = jest.fn(() => {
  (global as any).SyncTasksManager = mockManager;
  (global as any).createTask = mockCreateTask;
  return true;
});

jest.mock('../NativeSyncTasks', () => ({
  __esModule: true,
  default: { install: mockInstall },
}));

const loadLibrary = (): typeof import('../index') => {
  let lib: typeof import('../index') | undefined;
  jest.isolateModules(() => {
    lib = require('../index');
  });
  return lib!;
};

const url = 'https://example.com';
const onData = () => {};

beforeEach(() => {
  jest.clearAllMocks();
  delete (global as any).SyncTasksManager;
  delete (global as any).createTask;
});

describe('installation', () => {
  it('calls install() when the bindings are missing (old architecture)', () => {
    loadLibrary();

    expect(mockInstall).toHaveBeenCalledTimes(1);
  });

  it('skips install() when the bindings are already installed (new architecture)', () => {
    (global as any).SyncTasksManager = mockManager;
    (global as any).createTask = mockCreateTask;

    loadLibrary();

    expect(mockInstall).not.toHaveBeenCalled();
  });
});

describe('createTask', () => {
  it('fills in interval 1000ms and timeout 30000ms', () => {
    const { createTask } = loadLibrary();

    createTask({ config: { url }, onData });

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { url, interval: 1000, timeout: 30000 },
      })
    );
  });

  it('passes every option and callback through unchanged', () => {
    const { createTask } = loadLibrary();
    const onError = () => {};
    const config = {
      url,
      interval: 250,
      timeout: 1500,
      method: 'POST' as const,
      body: '{"a":1}',
      headers: { A: 'b' },
      immediate: true,
      jitter: 0.2,
      backoff: { multiplier: 3, maxInterval: 5000 },
      conditional: false,
    };

    const task = createTask({ config, onData, onError });

    expect(mockCreateTask).toHaveBeenCalledWith({ config, onData, onError });
    expect(task).toBe(mockNativeTask);
  });

  it.each([
    [{ interval: 0 }, 'interval must be a number of ms'],
    [{ interval: -5 }, 'interval must be a number of ms'],
    [{ interval: NaN }, 'interval must be a number of ms'],
    [{ interval: Infinity }, 'interval must be a number of ms'],
    [{ interval: 1e12 }, 'interval must be a number of ms'],
    [{ timeout: 0 }, 'timeout must be a number of ms'],
    [{ timeout: -1 }, 'timeout must be a number of ms'],
    [{ timeout: NaN }, 'timeout must be a number of ms'],
    [{ timeout: 1e12 }, 'timeout must be a number of ms'],
    [{ method: 'HEAD' }, 'method must be one of'],
    [{ body: 'x' }, 'body is not allowed with GET'],
    [{ method: 'POST', body: 1 }, 'body must be a string'],
    [{ jitter: 1.5 }, 'jitter must be a number between 0 and 1'],
    [{ jitter: -0.1 }, 'jitter must be a number between 0 and 1'],
    [{ backoff: { multiplier: 0.5 } }, 'backoff.multiplier must be'],
    [
      { interval: 5000, backoff: { maxInterval: 1000 } },
      'backoff.maxInterval must be',
    ],
  ])('rejects %j', (extra, message) => {
    const { createTask } = loadLibrary();

    expect(() =>
      createTask({ config: { url, ...(extra as object) }, onData })
    ).toThrow(message);
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it('rejects a missing url', () => {
    const { createTask } = loadLibrary();

    expect(() => createTask({ config: {} as any, onData })).toThrow(
      'config.url must be a string'
    );
  });

  it('throws a clear error when the native module is not installed', () => {
    mockInstall.mockImplementationOnce(() => false);
    const { createTask } = loadLibrary();

    expect(() => createTask({ config: { url }, onData })).toThrow(
      'native module is not installed'
    );
  });
});

describe('SyncTasksManager', () => {
  it('delegates to the native manager', () => {
    const { SyncTasksManager } = loadLibrary();
    const task = mockNativeTask as any;

    SyncTasksManager.addTask(task);
    SyncTasksManager.addTasks([task]);
    SyncTasksManager.removeTask(task);
    SyncTasksManager.startAll();
    SyncTasksManager.stopAll();
    SyncTasksManager.setMaxConcurrentRequests(2);

    expect(mockManager.addTask).toHaveBeenCalledWith(task);
    expect(mockManager.addTasks).toHaveBeenCalledWith([task]);
    expect(mockManager.removeTask).toHaveBeenCalledWith(task);
    expect(mockManager.startAll).toHaveBeenCalledTimes(1);
    expect(mockManager.stopAll).toHaveBeenCalledTimes(1);
    expect(mockManager.setMaxConcurrentRequests).toHaveBeenCalledWith(2);
  });

  it('throws a clear error when the native module is not installed', () => {
    mockInstall.mockImplementationOnce(() => false);
    const { SyncTasksManager } = loadLibrary();

    expect(() => SyncTasksManager.startAll()).toThrow(
      'native module is not installed'
    );
  });
});

describe('public types', () => {
  it('exports usable types for params and callbacks', () => {
    const lib = loadLibrary();
    type Params = import('../index').CreateTaskParams<{ id: number }>;
    const params: Params = {
      config: { url },
      onData: (data) =>
        data.body.id + data.status_code + Object.keys(data.headers).length,
      onError: (error) => error.error + error.headers.x,
    };

    expect(lib.createTask(params)).toBe(mockNativeTask);
  });
});
