import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';
import { definePlugin } from '@react-native-harness/plugins';
import { HTTP_PORT, HTTPS_PORT, markRunFinished, recordTest, startMockServer } from './mock-server.mjs';

// How long the results screen stays up before Harness closes the app.
const RESULTS_HOLD_MS = Number(process.env.HARNESS_RESULTS_HOLD_MS ?? (process.env.CI ? 0 : 15000));

const adb = process.env.ANDROID_HOME
  ? `${process.env.ANDROID_HOME}/platform-tools/adb`
  : 'adb';

// Starts the mock backend on the host; Android devices reach it through `adb reverse`.
export const mockServerPlugin = () => {
  let stop;

  return definePlugin({
    name: 'synctasks-mock-server',
    hooks: {
      harness: {
        beforeCreation: async (ctx) => {
          stop = await startMockServer();
          ctx.logger.info(`mock server on :${HTTP_PORT} (http) and :${HTTPS_PORT} (https)`);
        },
        beforeDispose: async () => {
          await stop?.();
        },
      },
      // Test statuses come from the host side, so they work no matter how the app runtime is reset.
      test: {
        started: (ctx) => {
          recordTest({ file: basename(ctx.file), suite: ctx.suite, name: ctx.name, status: 'running' });
        },
        finished: (ctx) => {
          recordTest({
            file: basename(ctx.file),
            suite: ctx.suite,
            name: ctx.name,
            status: ctx.status,
            ms: Math.round(ctx.duration),
            error: ctx.error?.message?.split('\n')[0],
          });
        },
      },
      run: {
        finished: async () => {
          markRunFinished();
          await new Promise((r) => setTimeout(r, RESULTS_HOLD_MS));
        },
      },
      runtime: {
        ready: async (ctx) => {
          if (ctx.platform.platformId !== 'android') return;
          const serials = execFileSync(adb, ['devices'])
            .toString()
            .split('\n')
            .slice(1)
            .filter((line) => line.endsWith('\tdevice'))
            .map((line) => line.split('\t')[0]);
          for (const serial of serials) {
            for (const port of [HTTP_PORT, HTTPS_PORT]) {
              execFileSync(adb, ['-s', serial, 'reverse', `tcp:${port}`, `tcp:${port}`]);
            }
          }
        },
      },
    },
  });
};
