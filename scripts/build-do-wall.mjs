import { createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

import { ZipArchive } from 'archiver';

const root = resolve(import.meta.dirname, '..');
const wallRoot = resolve(root, 'do-app-wall');
const output = resolve(wallRoot, '.output');
const archivePath = resolve(root, 'data-deserts-do-wall-linux.zip');

const build = spawnSync('pnpm', ['build'], {
    cwd: wallRoot,
    stdio: 'inherit',
    env: { ...process.env, CI: 'true' }
});

if (build.error) throw build.error;
if (build.status !== 0) {
    throw new Error(`DO wall build failed with exit code ${build.status ?? 'unknown'}`);
}

const outputStats = await stat(output).catch(() => null);
if (!outputStats?.isDirectory() || (await readdir(output)).length === 0) {
    throw new Error('DO wall build did not produce do-app-wall/.output');
}

await new Promise((resolveArchive, rejectArchive) => {
    const destination = createWriteStream(archivePath);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    destination.on('close', resolveArchive);
    destination.on('error', rejectArchive);
    archive.on('error', rejectArchive);
    archive.pipe(destination);
    archive.directory(output, false);
    archive.file(resolve(wallRoot, '.env.template'), { name: '.env.template' });
    archive.file(resolve(wallRoot, 'nginx.data-deserts.conf.example'), {
        name: 'nginx.data-deserts.conf.example'
    });
    void archive.finalize();
});

console.log('Created data-deserts-do-wall-linux.zip.');
console.log('After extraction, run: HOST=0.0.0.0 PORT=8080 node server/index.mjs');
