const Sequencer = require('@jest/test-sequencer').default;

// All files share one JS runtime (no reset between files), so order matters:
// manager first, because startAll() restarts every task registered so far;
// timeout last, because its hanging requests keep pool threads busy for ~30s.
const FIRST = ['manager.harness.ts'];
const LAST = ['external-tls.harness.ts', 'timeout.harness.ts'];

const rank = (path) => {
  const name = path.split('/').pop();
  if (FIRST.includes(name)) return -1;
  if (LAST.includes(name)) return 1 + LAST.indexOf(name);
  return 0;
};

module.exports = class HarnessSequencer extends Sequencer {
  sort(tests) {
    return [...tests].sort((a, b) => rank(a.path) - rank(b.path) || a.path.localeCompare(b.path));
  }
};
