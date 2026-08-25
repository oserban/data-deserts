import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const executable = resolve(
    import.meta.dirname,
    '..',
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vp.cmd' : 'vp'
);
let interrupted = false;

const child = spawn(executable, ['dev'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: process.env,
    stdio: 'inherit'
});

// The terminal also delivers these signals to the child. Keeping the parent alive until the child
// closes lets us translate an intentional shutdown into a successful pnpm lifecycle result.
process.on('SIGINT', () => {
    interrupted = true;
});
process.on('SIGTERM', () => {
    interrupted = true;
});

child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
});

child.on('close', (code, signal) => {
    const expectedShutdown = interrupted || signal === 'SIGINT' || signal === 'SIGTERM';
    process.exit(expectedShutdown ? 0 : (code ?? 1));
});
