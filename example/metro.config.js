const path = require('path');
const { getDefaultConfig } = require('@react-native/metro-config');
const { getConfig } = require('react-native-builder-bob/metro-config');
const pkg = require('../package.json');

const root = path.resolve(__dirname, '..');

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = getConfig(getDefaultConfig(__dirname), {
  root,
  pkg,
  project: __dirname,
});

// Harness tests: swap Harness' runner screen for our results screen (harness/HarnessScreen.tsx).
const harnessRunnerScreen = path.join(
  'node_modules',
  '@react-native-harness',
  'runtime',
  'dist',
  'ui'
);
const upstreamResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (
    moduleName === './RunnerScreen.js' &&
    path.dirname(context.originModulePath).endsWith(harnessRunnerScreen)
  ) {
    return {
      type: 'sourceFile',
      filePath: path.join(__dirname, 'harness', 'HarnessScreen.tsx'),
    };
  }

  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
