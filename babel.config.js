module.exports = (api) => {
  // Jest loads React Native's own sources, which need the matching RN preset.
  const isTest = api.env('test');

  return {
    presets: [
      isTest
        ? 'module:@react-native/babel-preset'
        : 'module:react-native-builder-bob/babel-preset',
    ],
  };
};
