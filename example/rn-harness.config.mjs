import {
  androidEmulator,
  androidPlatform,
  physicalAndroidDevice,
} from '@react-native-harness/platform-android';
import {
  applePhysicalDevice,
  applePlatform,
  appleSimulator,
} from '@react-native-harness/platform-apple';
import { networkInterfaces } from 'node:os';
import { mockServerPlugin } from './harness/mock-server-plugin.mjs';

const METRO_PORT = 8097;
// A physical iPhone reaches Metro over Wi-Fi.
const lanIp = Object.values(networkInterfaces())
  .flat()
  .find((i) => i?.family === 'IPv4' && !i.internal)?.address;

export default {
  entryPoint: './index.js',
  appRegistryComponentName: 'SyncTasksExample',
  metroPort: METRO_PORT,
  // Polling tests wait for several intervals; the timeout test waits ~30s.
  testTimeout: 60000,
  // One JS runtime for the whole run: no reload between files (order is fixed in harness/sequencer.cjs).
  resetEnvironmentBetweenTestFiles: false,
  // Bump when metro.config.js resolution changes (the RunnerScreen override).
  cache: { version: '2' },
  runners: [
    applePlatform({
      name: 'ios',
      // CI picks an available simulator and passes it through these variables.
      device: appleSimulator(
        process.env.HARNESS_IOS_SIMULATOR ?? 'SyncTasks 17 Pro Max',
        process.env.HARNESS_IOS_VERSION ?? '26.5'
      ),
      bundleId: 'synctasks.example',
    }),
    // Physical iPhone (signed with a personal team). The prebuilt RN core hardcodes port 8081,
    // so the Metro address goes in as an NSUserDefaults launch argument; see .yarn/patches for the Harness side.
    applePlatform({
      name: 'ios-device',
      device: applePhysicalDevice('iPhone 16PRO'),
      bundleId: 'com.shumihin.synctasks.example',
      appLaunchOptions: { arguments: ['-RCT_jsLocation', `${lanIp}:${METRO_PORT}`] },
    }),
    androidPlatform({
      name: 'android',
      device: androidEmulator('synctasks_api35', {
        apiLevel: 35,
        profile: 'pixel_7',
      }),
      bundleId: 'synctasks.example',
    }),
    androidPlatform({
      name: 'android-device',
      device: physicalAndroidDevice('Google', 'Pixel 8a'),
      bundleId: 'synctasks.example',
    }),
  ],
  defaultRunner: 'ios',
  plugins: [mockServerPlugin()],
};
