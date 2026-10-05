import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temp = join(root, '.build-tmp');
mkdirSync(temp, { recursive: true });
const args = process.argv.slice(2);
// Development gets an isolated profile. Release builds retain normal OS application directories.
if (args[0] === 'dev' || (args[0] === 'build' && args.includes('--debug'))) {
  const dataDirectory = join(root, '.runtime-data');
  mkdirSync(dataDirectory, { recursive: true });
  const config = join(temp, 'tauri.dev.json');
  writeFileSync(config, JSON.stringify({ app: { appDirectoriesOverride: dataDirectory } }));
  args.push('--config', config);
}
const child = spawn(
  process.execPath,
  [join(root, 'node_modules', '@tauri-apps', 'cli', 'tauri.js'), ...args],
  {
    cwd: root,
    stdio: 'inherit',
    env: process.platform === 'win32' ? { ...process.env, TEMP: temp, TMP: temp } : process.env,
  },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
