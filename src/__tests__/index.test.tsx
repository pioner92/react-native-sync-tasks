const mockNativeTask = {
  start: jest.fn(),
  stop: jest.fn(),
  isRunning: jest.fn(() => false),
};
const mockManager = {
  addTask: jest.fn(),
  addTasks: jest.fn(),
  startAll: jest.fn(),
  stopAll: jest.fn(),
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
  const onData = () => {};

  it('defaults interval to 1000ms and timeout to 30000ms inside config', () => {
    const { createTask } = loadLibrary();

    createTask({ config: { url: 'https://example.com' }, onData });

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { url: 'https://example.com', interval: 1000, timeout: 30000 },
      })
    );
  });

  it('passes an explicit timeout through', () => {
    const { createTask } = loadLibrary();

    createTask({
      config: { url: 'https://example.com', timeout: 1500 },
      onData,
    });

    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        config: { url: 'https://example.com', interval: 1000, timeout: 1500 },
      })
    );
  });

  it.each([0, -1, NaN, Infinity])('rejects timeout %p', (timeout) => {
    const { createTask } = loadLibrary();

    expect(() =>
      createTask({ config: { url: 'https://example.com', timeout }, onData })
    ).toThrow('timeout must be a positive number');
    expect(mockCreateTask).not.toHaveBeenCalled();
  });

  it('keeps an explicit interval, headers and callbacks', () => {
    const { createTask } = loadLibrary();
    const onError = () => {};

    const task = createTask({
      config: {
        url: 'https://example.com',
        interval: 250,
        headers: { A: 'b' },
      },
      onData,
      onError,
    });

    expect(mockCreateTask).toHaveBeenCalledWith({
      config: {
        url: 'https://example.com',
        interval: 250,
        headers: { A: 'b' },
        timeout: 30000,
      },
      onData,
      onError,
    });
    expect(task).toBe(mockNativeTask);
  });
});

describe('SyncTasksManager', () => {
  it('delegates to the native manager', () => {
    const { SyncTasksManager } = loadLibrary();
    const task = mockNativeTask as any;

    SyncTasksManager.addTask(task);
    SyncTasksManager.addTasks([task]);
    SyncTasksManager.startAll();
    SyncTasksManager.stopAll();

    expect(mockManager.addTask).toHaveBeenCalledWith(task);
    expect(mockManager.addTasks).toHaveBeenCalledWith([task]);
    expect(mockManager.startAll).toHaveBeenCalledTimes(1);
    expect(mockManager.stopAll).toHaveBeenCalledTimes(1);
  });

  it('throws a clear error when the native module is not installed', () => {
    mockInstall.mockImplementationOnce(() => false);
    const { SyncTasksManager } = loadLibrary();

    expect(() => SyncTasksManager.startAll()).toThrow(
      'TaskManager not initialized'
    );
  });
});
