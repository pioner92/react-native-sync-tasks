export default {
  preset: 'react-native-harness',
  testMatch: ['<rootDir>/harness/**/*.harness.ts'],
  testSequencer: '<rootDir>/harness/sequencer.cjs',
};
