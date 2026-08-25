import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const executable = resolve(
    import.meta.dirname,
    '..',
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'vp.cmd' : 'vp'
);

const child = spawn(executable, ['build'], {
    cwd: resolve(import.meta.dirname, '..'),
    env: {
        ...process.env,
        BABEL_ENV: 'production',
        NODE_ENV: 'production'
    },
    stdio: 'inherit'
});

child.on('error', (error) => {
    console.error(error);
    process.exitCode = 1;
});

child.on('close', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 1);
});
