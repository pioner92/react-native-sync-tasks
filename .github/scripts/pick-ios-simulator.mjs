// Picks an available iPhone simulator on the newest iOS runtime and exports it for rn-harness.config.mjs.
import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

const { devices } = JSON.parse(
  execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json']).toString()
);

const candidates = Object.entries(devices)
  .filter(([runtime]) => runtime.includes('.iOS-'))
  .flatMap(([runtime, list]) =>
    list
      .filter((device) => device.name.startsWith('iPhone'))
      .map((device) => ({
        name: device.name,
        version: runtime.split('.iOS-')[1].replace(/-/g, '.'),
      }))
  )
  .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }));

if (!candidates.length) {
  throw new Error('No available iPhone simulator found');
}

const { name, version } = candidates[0];
console.log(`Using ${name} (iOS ${version})`);
appendFileSync(
  process.env.GITHUB_ENV,
  `HARNESS_IOS_SIMULATOR=${name}\nHARNESS_IOS_VERSION=${version}\n`
);
