import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

it('manual start and stop do not change the login-startup setting', () => {
  const home = mkdtempSync(join(tmpdir(), 'hotc-bridge-test-'));
  try {
    const bin = join(home, 'bin');
    mkdirSync(bin);
    mkdirSync(join(home, 'Library/LaunchAgents'), { recursive: true });
    const plist = join(home, 'Library/LaunchAgents/life.hotc.print-bridge.plist');
    writeFileSync(plist, 'login-startup-setting');
    writeFileSync(join(bin, 'launchctl'), `#!/bin/bash
echo "$1" >> "$HOME/calls"
case "$1" in
print) test -f "$HOME/loaded";;
bootstrap) touch "$HOME/loaded";;
kickstart) test -f "$HOME/loaded";;
bootout) rm "$HOME/loaded";;
esac
`, { mode: 0o755 });
    // Fake bridge health check: answers only while the service is loaded.
    writeFileSync(join(bin, 'curl'), '#!/bin/bash\ntest -f "$HOME/loaded"\n', { mode: 0o755 });
    const run = (action: string) => execFileSync('bash', [resolve('print-bridge/bridge-ctl.command'), action], {
      env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` },
    });
    run('start'); run('start'); run('stop'); run('stop');
    const calls = readFileSync(join(home, 'calls'), 'utf8').split('\n');
    expect(calls.filter(call => call === 'bootstrap')).toHaveLength(1);
    expect(calls.filter(call => call === 'bootout')).toHaveLength(1);
    expect(readFileSync(plist, 'utf8')).toBe('login-startup-setting');
  } finally { rmSync(home, { recursive: true, force: true }); }
});